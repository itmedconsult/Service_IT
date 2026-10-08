<?php

if (!defined('ABSPATH')) {
    exit;
}

final class MCPS_Plugin
{
    public const OPTION_KEY = 'mcps_settings';

    public static function boot(): void
    {
        $content = new MCPS_Content_Model();
        $audit = new MCPS_Audit_Log();
        $client = new MCPS_Supabase_Client(self::settings());

        add_action('init', array($content, 'register_post_type'), 5);
        $content->register_shortcodes();
        add_action('acf/init', array($content, 'register_acf_fields'));
        add_action('rest_api_init', array(new MCPS_REST_Controller($client, $content, $audit), 'register_routes'));
        add_filter('rest_allowed_cors_headers', array(self::class, 'allow_idempotency_header'));

        if (is_admin()) {
            (new MCPS_Admin())->register();
        }
    }

    /** @param string[] $headers @return string[] */
    public static function allow_idempotency_header(array $headers): array
    {
        $headers[] = 'Idempotency-Key';
        return array_values(array_unique($headers));
    }

    public static function activate(): void
    {
        MCPS_Audit_Log::install();
        (new MCPS_Content_Model())->register_post_type();
        flush_rewrite_rules();
    }

    /** @return array{supabase_url:string,publishable_key:string,allowed_roles:string} */
    public static function settings(): array
    {
        $defaults = array(
            'supabase_url' => '',
            'publishable_key' => '',
            'allowed_roles' => 'price_admin,admin',
        );

        $saved = get_option(self::OPTION_KEY, array());
        return wp_parse_args(is_array($saved) ? $saved : array(), $defaults);
    }
}
