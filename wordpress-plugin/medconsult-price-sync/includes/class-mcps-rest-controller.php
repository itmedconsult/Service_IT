<?php

if (!defined('ABSPATH')) {
    exit;
}

final class MCPS_REST_Controller
{
    private const NAMESPACE = 'medconsult-price-sync/v1';
    private MCPS_Supabase_Client $client;
    private MCPS_Content_Model $content;
    private MCPS_Audit_Log $audit;
    private MCPS_Promotion_Prices $promotion;
    /** @var array<string,mixed>|null */
    private ?array $current_user = null;
    private string $current_token = '';

    public function __construct(MCPS_Supabase_Client $client, MCPS_Content_Model $content, MCPS_Audit_Log $audit)
    {
        $this->client = $client;
        $this->content = $content;
        $this->audit = $audit;
        $this->promotion = new MCPS_Promotion_Prices();
    }

    public function register_routes(): void
    {
        register_rest_route(self::NAMESPACE, '/health', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'health'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route(self::NAMESPACE, '/products/(?P<code>[A-Za-z0-9._-]+)', array(
            'methods' => array('PUT', 'PATCH'),
            'callback' => array($this, 'update_product'),
            'permission_callback' => array($this, 'authorize'),
        ));

        register_rest_route(self::NAMESPACE, '/bulk-prices', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'bulk_update'),
            'permission_callback' => array($this, 'authorize'),
        ));

        register_rest_route(self::NAMESPACE, '/promotion-prices', array(
            array(
                'methods' => WP_REST_Server::READABLE,
                'callback' => array($this->promotion, 'list_prices'),
                'permission_callback' => '__return_true',
            ),
            array(
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => array($this, 'update_promotion_price'),
                'permission_callback' => array($this, 'authorize'),
            ),
        ));
    }

    public function health(): WP_REST_Response
    {
        return new WP_REST_Response(array(
            'ok' => true,
            'configured' => $this->client->is_configured(),
            'version' => MCPS_VERSION,
        ));
    }

    public function authorize(WP_REST_Request $request): bool|WP_Error
    {
        $header = $request->get_header('authorization');
        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return new WP_Error('mcps_missing_token', 'A Supabase bearer token is required.', array('status' => 401));
        }

        $user = $this->client->validate_access_token(trim($matches[1]));
        if (is_wp_error($user)) {
            return $user;
        }

        $metadata = is_array($user['app_metadata'] ?? null) ? $user['app_metadata'] : array();
        $roles = array();
        if (is_string($metadata['role'] ?? null)) {
            $roles[] = $metadata['role'];
        }
        if (is_array($metadata['roles'] ?? null)) {
            $roles = array_merge($roles, $metadata['roles']);
        }
        $roles = array_map('sanitize_key', array_filter($roles, 'is_string'));

        if (!array_intersect($roles, $this->client->allowed_roles())) {
            return new WP_Error('mcps_forbidden_role', 'This Supabase user cannot manage prices.', array('status' => 403));
        }

        $this->current_user = $user;
        $this->current_token = trim($matches[1]);
        return true;
    }

    public function update_product(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $body = $request->get_json_params();
        $code = sanitize_text_field((string) $request['code']);
        $request_id = $this->request_id($request, $code);

        $previous = $this->audit->find($request_id);
        if ($previous) {
            return new WP_REST_Response(array('ok' => true, 'replayed' => true, 'audit' => $previous), 200);
        }

        $changes = $this->sanitize_changes(is_array($body) ? $body : array());
        if (is_wp_error($changes)) {
            return $changes;
        }

        return $this->apply_update($code, $changes, $request_id);
    }

    public function bulk_update(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $body = $request->get_json_params();
        $items = is_array($body['items'] ?? null) ? $body['items'] : array();
        if (!$items || count($items) > 100) {
            return new WP_Error('mcps_invalid_batch', 'Provide between 1 and 100 price updates.', array('status' => 400));
        }

        $results = array();
        $has_errors = false;
        foreach ($items as $index => $item) {
            $code = sanitize_text_field((string) ($item['code'] ?? ''));
            $changes = $this->sanitize_changes(is_array($item) ? $item : array());
            if ($code === '' || is_wp_error($changes)) {
                $has_errors = true;
                $results[] = array('code' => $code, 'ok' => false, 'message' => is_wp_error($changes) ? $changes->get_error_message() : 'Missing product code.');
                continue;
            }

            $response = $this->apply_update($code, $changes, $this->request_id($request, $code . '-' . $index));
            if (is_wp_error($response)) {
                $has_errors = true;
                $results[] = array('code' => $code, 'ok' => false, 'message' => $response->get_error_message());
            } else {
                $results[] = array_merge(array('code' => $code), $response->get_data());
            }
        }

        return new WP_REST_Response(array('ok' => !$has_errors, 'results' => $results), $has_errors ? 207 : 200);
    }

    public function update_promotion_price(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $response = $this->promotion->update_price($request);
        if (is_wp_error($response)) {
            return $response;
        }
        $result = $response->get_data();
        $key = 'tablepress:' . $result['table_id'] . ':' . $result['row_index'] . ':' . $result['column_index'];
        $this->audit->record(array(
            'request_id' => $this->request_id($request, $key),
            'product_code' => $key,
            'old_price' => $result['old_price'],
            'new_price' => $result['price'],
            'supabase_user_id' => $this->current_user['id'] ?? '',
            'supabase_email' => $this->current_user['email'] ?? '',
        ));
        return $response;
    }

    /** @param array<string,mixed> $changes */
    private function apply_update(string $code, array $changes, string $request_id): WP_REST_Response|WP_Error
    {
        $product = $this->client->update_product($code, $changes, $this->current_token);
        if (is_wp_error($product)) {
            return $product;
        }

        $post_id = $this->content->upsert($product);
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        $this->audit->record(array(
            'request_id' => $request_id,
            'product_code' => $code,
            'old_price' => null,
            'new_price' => $product['price'],
            'supabase_user_id' => $this->current_user['id'] ?? '',
            'supabase_email' => $this->current_user['email'] ?? '',
        ));

        return new WP_REST_Response(array(
            'ok' => true,
            'replayed' => false,
            'wordpress_post_id' => $post_id,
            'product' => $product,
        ), 200);
    }

    /** @param array<string,mixed> $body @return array<string,mixed>|WP_Error */
    private function sanitize_changes(array $body): array|WP_Error
    {
        if (!isset($body['price']) || !is_numeric($body['price'])) {
            return new WP_Error('mcps_invalid_price', 'Price must be numeric.', array('status' => 400));
        }
        $price = round((float) $body['price'], 2);
        if ($price < 0 || $price > 10000000) {
            return new WP_Error('mcps_invalid_price', 'Price is outside the allowed range.', array('status' => 400));
        }

        $changes = array('price' => $price, 'updated_at' => gmdate('c'));
        if (array_key_exists('active', $body)) {
            $changes['active'] = rest_sanitize_boolean($body['active']);
        }
        foreach (array('name', 'group', 'type') as $key) {
            if (isset($body[$key])) {
                $changes[$key] = sanitize_text_field((string) $body[$key]);
            }
        }
        return $changes;
    }

    private function request_id(WP_REST_Request $request, string $suffix): string
    {
        $provided = sanitize_text_field($request->get_header('idempotency-key'));
        if ($provided !== '') {
            return substr(hash('sha256', $provided . '|' . $suffix), 0, 64);
        }
        return wp_generate_uuid4();
    }
}
