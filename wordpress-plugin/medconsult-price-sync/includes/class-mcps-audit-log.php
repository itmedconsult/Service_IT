<?php

if (!defined('ABSPATH')) {
    exit;
}

final class MCPS_Audit_Log
{
    public static function install(): void
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $table = $wpdb->prefix . 'mcps_audit_log';
        $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id bigint unsigned NOT NULL AUTO_INCREMENT,
            request_id varchar(64) NOT NULL,
            product_code varchar(191) NOT NULL,
            old_price decimal(14,2) NULL,
            new_price decimal(14,2) NOT NULL,
            supabase_user_id varchar(64) NOT NULL,
            supabase_email varchar(191) NULL,
            result varchar(32) NOT NULL DEFAULT 'success',
            created_at datetime NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY request_id (request_id),
            KEY product_code (product_code)
        ) {$charset};");
    }

    /** @return array<string,mixed>|null */
    public function find(string $request_id): ?array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'mcps_audit_log';
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE request_id = %s", $request_id), ARRAY_A);
        return is_array($row) ? $row : null;
    }

    /** @param array<string,mixed> $entry */
    public function record(array $entry): void
    {
        global $wpdb;
        $wpdb->insert($wpdb->prefix . 'mcps_audit_log', array(
            'request_id' => sanitize_text_field((string) $entry['request_id']),
            'product_code' => sanitize_text_field((string) $entry['product_code']),
            'old_price' => isset($entry['old_price']) ? (float) $entry['old_price'] : null,
            'new_price' => (float) $entry['new_price'],
            'supabase_user_id' => sanitize_text_field((string) $entry['supabase_user_id']),
            'supabase_email' => sanitize_email((string) ($entry['supabase_email'] ?? '')),
            'result' => sanitize_key((string) ($entry['result'] ?? 'success')),
            'created_at' => current_time('mysql', true),
        ), array('%s', '%s', '%f', '%f', '%s', '%s', '%s', '%s'));
    }
}
