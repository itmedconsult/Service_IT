<?php

if (!defined('ABSPATH')) {
    exit;
}

/** Prices in the TablePress tables embedded on the published promotion page. */
final class MCPS_Promotion_Prices
{
    private const PAGE_ID = 8080;
    /** @var string[]|null */
    private ?array $published_ids = null;

    /** @return string[] */
    private function published_table_ids(): array
    {
        if ($this->published_ids !== null) {
            return $this->published_ids;
        }
        $page = get_post(self::PAGE_ID);
        if (!$page || $page->post_status !== 'publish') {
            return array();
        }

        // The Aesthetic tabs are assembled outside the main Elementor data. Read
        // the published page so the editor only includes tables visitors can see.
        $response = wp_remote_get(get_permalink(self::PAGE_ID), array('timeout' => 12));
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            preg_match_all('/\bid=["\']tablepress-([0-9]+)["\']/i', wp_remote_retrieve_body($response), $rendered);
            if (!empty($rendered[1])) {
                $this->published_ids = array_values(array_unique($rendered[1]));
                return $this->published_ids;
            }
        }

        $elementor = get_post_meta(self::PAGE_ID, '_elementor_data', true);
        $source = $page->post_content . ' ' . (is_string($elementor) ? $elementor : wp_json_encode($elementor));
        $source = str_replace('\\"', '"', $source);
        preg_match_all('/\[table[^\]]*\bid\s*=\s*["\']?([0-9]+)/i', $source, $matches);
        $this->published_ids = array_values(array_unique($matches[1] ?? array()));
        return $this->published_ids;
    }

    /** @return array<string,mixed>|WP_Error */
    private function load_table(string $id): array|WP_Error
    {
        if (!in_array($id, $this->published_table_ids(), true)) {
            return new WP_Error('mcps_table_not_on_page', 'This table is not on the published promotion page.', array('status' => 404));
        }
        if (!class_exists('TablePress') || !isset(TablePress::$model_table)) {
            return new WP_Error('mcps_tablepress_missing', 'TablePress is not available.', array('status' => 503));
        }
        $table = TablePress::$model_table->load($id, true, true);
        return is_wp_error($table) ? new WP_Error('mcps_table_unavailable', 'The promotion table could not be loaded.', array('status' => 503)) : $table;
    }

    /** @return array{price:float,prefix:string,suffix:string,decimals:int}|null */
    private function parse_price(string $raw): ?array
    {
        if (!preg_match('/^\s*(฿\s*)?([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(\.[0-9]{1,2})?(\s*฿)?\s*$/u', $raw, $parts)) {
            return null;
        }
        return array(
            'price' => (float) str_replace(',', '', $parts[2] . ($parts[3] ?? '')),
            'prefix' => $parts[1] ?? '',
            'suffix' => $parts[4] ?? '',
            'decimals' => isset($parts[3]) ? strlen($parts[3]) - 1 : 0,
        );
    }

    public function list_prices(): WP_REST_Response|WP_Error
    {
        $ids = $this->published_table_ids();
        if (!$ids) {
            return new WP_Error('mcps_no_promotion_tables', 'No TablePress tables were found on the published promotion page.', array('status' => 503));
        }
        $items = array();
        foreach ($ids as $id) {
            $table = $this->load_table($id);
            if (is_wp_error($table)) {
                return $table;
            }
            $data = $table['data'];
            $headers = array_map('wp_strip_all_tags', $data[0] ?? array());
            $context = '';
            foreach ($data as $row_index => $row) {
                if ($row_index === 0 || !is_array($row)) {
                    continue;
                }
                $first = trim(wp_strip_all_tags((string) ($row[0] ?? '')));
                $has_price = false;
                foreach ($row as $column_index => $raw) {
                    if ($column_index === 0 || !is_string($raw)) {
                        continue;
                    }
                    $parsed = $this->parse_price($raw);
                    if (!$parsed) {
                        continue;
                    }
                    $has_price = true;
                    $second = $column_index > 1 ? trim(wp_strip_all_tags((string) ($row[1] ?? ''))) : '';
                    if ($second !== '' && $this->parse_price($second)) {
                        $second = '';
                    }
                    $parts = array_filter(array($context, $first, $second, $headers[$column_index] ?? ''), static fn($value) => $value !== '' && $value !== '-');
                    $items[] = array(
                        'table_id' => $id,
                        'table_name' => wp_strip_all_tags((string) ($table['name'] ?? 'Table ' . $id)),
                        'row_index' => $row_index,
                        'column_index' => $column_index,
                        'label' => implode(' · ', array_unique($parts)),
                        'price' => $parsed['price'],
                        'raw' => $raw,
                    );
                }
                if ($first !== '' && !$has_price) {
                    $context = $first;
                }
            }
        }
        return new WP_REST_Response(array('ok' => true, 'page_url' => get_permalink(self::PAGE_ID), 'items' => $items), 200);
    }

    public function update_price(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('mcps_invalid_body', 'A JSON price update is required.', array('status' => 400));
        }
        $id = (string) ($body['table_id'] ?? '');
        $row = filter_var($body['row_index'] ?? null, FILTER_VALIDATE_INT);
        $column = filter_var($body['column_index'] ?? null, FILTER_VALIDATE_INT);
        $price = $body['price'] ?? null;
        $expected = $body['expected_raw'] ?? null;
        if (!ctype_digit($id) || $row === false || $row < 1 || $column === false || $column < 1 || !is_numeric($price) || !is_string($expected)) {
            return new WP_Error('mcps_invalid_price_cell', 'A valid table cell, current value, and price are required.', array('status' => 400));
        }
        $price = (float) $price;
        if (!is_finite($price) || $price < 0 || $price > 10000000 || abs($price - round($price, 2)) > 0.00001) {
            return new WP_Error('mcps_invalid_price', 'Price is outside the allowed range.', array('status' => 400));
        }
        $table = $this->load_table($id);
        if (is_wp_error($table)) {
            return $table;
        }
        $current = $table['data'][$row][$column] ?? null;
        if (!is_string($current) || $current !== $expected) {
            return new WP_Error('mcps_price_changed', 'The website price changed. Reload the list before saving.', array('status' => 409));
        }
        $format = $this->parse_price($current);
        if (!$format) {
            return new WP_Error('mcps_not_price_cell', 'This cell is not a simple price.', array('status' => 400));
        }
        $decimals = abs($price - round($price)) > 0.00001 ? max(2, $format['decimals']) : $format['decimals'];
        $new_raw = $format['prefix'] . number_format($price, $decimals, '.', ',') . $format['suffix'];
        $table['data'][$row][$column] = $new_raw;
        $saved = TablePress::$model_table->save($table);
        if (is_wp_error($saved)) {
            return new WP_Error('mcps_table_save_failed', 'TablePress could not save the price.', array('status' => 502));
        }
        return new WP_REST_Response(array('ok' => true, 'table_id' => $id, 'row_index' => $row, 'column_index' => $column, 'old_price' => $format['price'], 'price' => $price, 'raw' => $new_raw), 200);
    }
}
