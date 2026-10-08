<?php

if (!defined('ABSPATH')) {
    exit;
}

final class MCPS_Supabase_Client
{
    /** @var array{supabase_url:string,publishable_key:string,allowed_roles:string} */
    private array $settings;

    /** @param array{supabase_url:string,publishable_key:string,allowed_roles:string} $settings */
    public function __construct(array $settings)
    {
        $this->settings = $settings;
    }

    /** @return array<string,mixed>|WP_Error */
    public function validate_access_token(string $token): array|WP_Error
    {
        if (!$this->is_configured()) {
            return new WP_Error('mcps_not_configured', 'Supabase connection is not configured.', array('status' => 503));
        }

        $cache_key = 'mcps_auth_' . hash('sha256', $token);
        $cached = get_transient($cache_key);
        if (is_array($cached)) {
            return $cached;
        }

        $response = wp_remote_get($this->url('/auth/v1/user'), array(
            'timeout' => 12,
            'headers' => $this->headers($token),
        ));
        $decoded = $this->decode_response($response, 'Unable to validate the Supabase access token.');
        if (is_wp_error($decoded)) {
            return new WP_Error('mcps_invalid_token', 'Invalid or expired Supabase access token.', array('status' => 401));
        }

        set_transient($cache_key, $decoded, MINUTE_IN_SECONDS);
        return $decoded;
    }

    /**
     * @param array<string,mixed> $changes
     * @return array<string,mixed>|WP_Error
     */
    public function update_product(string $code, array $changes, string $token): array|WP_Error
    {
        $endpoint = $this->url('/rest/v1/products') . '?code=' . rawurlencode('eq.' . $code)
            . '&select=' . rawurlencode('id,code,name,group,type,price,active,updated_at');

        $response = wp_remote_request($endpoint, array(
            'method' => 'PATCH',
            'timeout' => 20,
            'headers' => array_merge($this->headers($token), array(
                'Content-Type' => 'application/json',
                'Prefer' => 'return=representation',
            )),
            'body' => wp_json_encode($changes),
        ));
        $decoded = $this->decode_response($response, 'Supabase rejected the product update.');
        if (is_wp_error($decoded)) {
            return $decoded;
        }
        if (!isset($decoded[0]) || !is_array($decoded[0])) {
            return new WP_Error('mcps_product_not_found', 'Product code was not found in Supabase.', array('status' => 404));
        }
        return $decoded[0];
    }

    public function is_configured(): bool
    {
        return $this->settings['supabase_url'] !== '' && $this->settings['publishable_key'] !== '';
    }

    /** @return string[] */
    public function allowed_roles(): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $this->settings['allowed_roles']))));
    }

    private function url(string $path): string
    {
        return untrailingslashit($this->settings['supabase_url']) . $path;
    }

    /** @return array<string,string> */
    private function headers(string $token): array
    {
        return array(
            'apikey' => $this->settings['publishable_key'],
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        );
    }

    /** @return array<mixed>|WP_Error */
    private function decode_response(array|WP_Error $response, string $fallback): array|WP_Error
    {
        if (is_wp_error($response)) {
            return new WP_Error('mcps_supabase_unreachable', $response->get_error_message(), array('status' => 502));
        }

        $status = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300) {
            $message = is_array($body) ? (string) ($body['message'] ?? $body['msg'] ?? $fallback) : $fallback;
            return new WP_Error('mcps_supabase_error', $message, array('status' => $status ?: 502));
        }

        return is_array($body) ? $body : array();
    }
}
