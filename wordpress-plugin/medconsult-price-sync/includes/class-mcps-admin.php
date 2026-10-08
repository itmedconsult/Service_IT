<?php

if (!defined('ABSPATH')) {
    exit;
}

final class MCPS_Admin
{
    public function register(): void
    {
        add_action('admin_menu', array($this, 'menu'));
        add_action('admin_init', array($this, 'settings'));
        add_action('admin_notices', array($this, 'configuration_notice'));
    }

    public function menu(): void
    {
        add_options_page(
            'MedConsult Price Sync',
            'Price Sync',
            'manage_options',
            'medconsult-price-sync',
            array($this, 'render')
        );
    }

    public function settings(): void
    {
        register_setting('mcps', MCPS_Plugin::OPTION_KEY, array($this, 'sanitize'));
        add_settings_section('mcps_connection', 'Supabase connection', '__return_false', 'mcps');

        $fields = array(
            'supabase_url' => array('Supabase project URL', 'url'),
            'publishable_key' => array('Publishable key', 'text'),
            'allowed_roles' => array('Allowed app_metadata roles', 'text'),
        );
        foreach ($fields as $key => $definition) {
            add_settings_field($key, $definition[0], array($this, 'field'), 'mcps', 'mcps_connection', array(
                'key' => $key,
                'type' => $definition[1],
            ));
        }
    }

    /** @param array<string,mixed> $input @return array<string,string> */
    public function sanitize(array $input): array
    {
        $roles = array_unique(array_filter(array_map('sanitize_key', array_map('trim', explode(',', (string) ($input['allowed_roles'] ?? ''))))));
        return array(
            'supabase_url' => untrailingslashit(esc_url_raw((string) ($input['supabase_url'] ?? ''))),
            'publishable_key' => sanitize_text_field((string) ($input['publishable_key'] ?? '')),
            'allowed_roles' => implode(',', $roles ?: array('price_admin')),
        );
    }

    /** @param array{key:string,type:string} $args */
    public function field(array $args): void
    {
        $settings = MCPS_Plugin::settings();
        $key = $args['key'];
        printf(
            '<input class="regular-text" type="%1$s" name="%2$s[%3$s]" value="%4$s" autocomplete="off">',
            esc_attr($args['type']),
            esc_attr(MCPS_Plugin::OPTION_KEY),
            esc_attr($key),
            esc_attr($settings[$key] ?? '')
        );
        if ($key === 'allowed_roles') {
            echo '<p class="description">Comma-separated roles from Supabase app_metadata. Do not authorize with user_metadata.</p>';
        }
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1>MedConsult Price Sync</h1>
            <p>External apps send a Supabase access token. The plugin validates the token and its app_metadata role before updating Supabase and WordPress.</p>
            <form action="options.php" method="post">
                <?php settings_fields('mcps'); ?>
                <?php do_settings_sections('mcps'); ?>
                <?php submit_button(); ?>
            </form>
            <h2>Endpoints</h2>
            <p><code><?php echo esc_html(rest_url('medconsult-price-sync/v1/health')); ?></code></p>
            <p><code>PUT <?php echo esc_html(rest_url('medconsult-price-sync/v1/products/{code}')); ?></code></p>
            <p><code>POST <?php echo esc_html(rest_url('medconsult-price-sync/v1/bulk-prices')); ?></code></p>
        </div>
        <?php
    }

    public function configuration_notice(): void
    {
        $screen = get_current_screen();
        if (!$screen || $screen->id !== 'settings_page_medconsult-price-sync') {
            return;
        }
        $settings = MCPS_Plugin::settings();
        if ($settings['supabase_url'] === '' || $settings['publishable_key'] === '') {
            echo '<div class="notice notice-warning"><p>Enter the Supabase URL and publishable key before using the price API.</p></div>';
        }
    }
}
