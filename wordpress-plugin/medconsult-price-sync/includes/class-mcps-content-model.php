<?php

if (!defined('ABSPATH')) {
    exit;
}

final class MCPS_Content_Model
{
    public const POST_TYPE = 'service_product';

    public function register_post_type(): void
    {
        if (post_type_exists(self::POST_TYPE)) {
            return;
        }

        register_post_type(self::POST_TYPE, array(
            'labels' => array(
                'name' => 'Service Products',
                'singular_name' => 'Service Product',
                'add_new_item' => 'Add New Service Product',
                'edit_item' => 'Edit Service Product',
            ),
            'public' => false,
            'publicly_queryable' => false,
            'show_ui' => true,
            'show_in_menu' => true,
            'show_in_rest' => true,
            'rest_base' => 'service-products',
            'exclude_from_search' => true,
            'supports' => array('title', 'revisions', 'custom-fields'),
            'menu_icon' => 'dashicons-products',
        ));
    }

    public function register_acf_fields(): void
    {
        if (!function_exists('acf_add_local_field_group')) {
            return;
        }

        if ($this->has_existing_acf_group()) {
            return;
        }

        acf_add_local_field_group(array(
            'key' => 'group_mcps_prices',
            'title' => 'Medconsult Prices',
            'show_in_rest' => 1,
            'fields' => array(
                $this->field('field_mcps_product_code', 'Product Code', 'product_code', 'text', true),
                $this->field('field_mcps_doctorease_id', 'DoctorEase ID', 'doctorease_id', 'text', false),
                $this->field('field_mcps_product_group', 'Product Group', 'product_group', 'text', true),
                array_merge($this->field('field_mcps_current_price', 'Current Price', 'current_price', 'number', true), array(
                    'min' => 0,
                    'step' => 0.01,
                    'prepend' => '฿',
                )),
                array_merge($this->field('field_mcps_product_status', 'Product Status', 'product_status', 'select', true), array(
                    'choices' => array('active' => 'Active', 'inactive' => 'Inactive', 'draft' => 'Draft'),
                    'default_value' => 'active',
                    'return_format' => 'value',
                )),
                array_merge($this->field('field_mcps_source_updated_at', 'Source Updated At', 'source_updated_at', 'date_time_picker', false), array(
                    'display_format' => 'd/m/Y H:i',
                    'return_format' => 'Y-m-d H:i:s',
                )),
            ),
            'location' => array(array(array(
                'param' => 'post_type',
                'operator' => '==',
                'value' => self::POST_TYPE,
            ))),
            'active' => true,
        ));
    }

    /** @param array<string,mixed> $product */
    public function upsert(array $product): int|WP_Error
    {
        $code = sanitize_text_field((string) ($product['code'] ?? ''));
        $name = sanitize_text_field((string) ($product['name'] ?? ''));
        if ($code === '' || $name === '') {
            return new WP_Error('mcps_invalid_product', 'Supabase returned an invalid product.', array('status' => 502));
        }

        $ids = get_posts(array(
            'post_type' => self::POST_TYPE,
            'post_status' => array('publish', 'draft', 'private'),
            'meta_key' => 'product_code',
            'meta_value' => $code,
            'fields' => 'ids',
            'posts_per_page' => 1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
        ));

        $post = array(
            'post_type' => self::POST_TYPE,
            'post_status' => 'publish',
            'post_title' => $name,
        );
        if ($ids) {
            $post['ID'] = (int) $ids[0];
        }

        $post_id = wp_insert_post(wp_slash($post), true);
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        $fields = array(
            'product_code' => $code,
            'product_group' => sanitize_text_field((string) ($product['group'] ?? 'Other')),
            'current_price' => (string) ($product['price'] ?? '0'),
            'product_status' => !empty($product['active']) ? 'active' : 'inactive',
            'source_updated_at' => $this->format_datetime((string) ($product['updated_at'] ?? '')),
        );

        foreach ($fields as $key => $value) {
            if (function_exists('update_field')) {
                update_field($key, $value, $post_id);
            } else {
                update_post_meta($post_id, $key, $value);
            }
        }

        update_post_meta($post_id, '_supabase_id', sanitize_text_field((string) ($product['id'] ?? '')));
        update_post_meta($post_id, '_supabase_type', sanitize_text_field((string) ($product['type'] ?? '')));
        return (int) $post_id;
    }

    private function has_existing_acf_group(): bool
    {
        if (!function_exists('acf_get_field_groups') || !function_exists('acf_get_fields')) {
            return false;
        }

        foreach (acf_get_field_groups(array('post_type' => self::POST_TYPE)) as $group) {
            foreach ((array) acf_get_fields($group) as $field) {
                if (($field['name'] ?? '') === 'product_code') {
                    return true;
                }
            }
        }
        return false;
    }

    /** @return array<string,mixed> */
    private function field(string $key, string $label, string $name, string $type, bool $required): array
    {
        return array(
            'key' => $key,
            'label' => $label,
            'name' => $name,
            'type' => $type,
            'required' => $required ? 1 : 0,
        );
    }

    private function format_datetime(string $value): string
    {
        $timestamp = strtotime($value);
        return $timestamp ? wp_date('Y-m-d H:i:s', $timestamp) : '';
    }
}
