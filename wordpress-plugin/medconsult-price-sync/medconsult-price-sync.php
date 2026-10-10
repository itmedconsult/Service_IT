<?php
/**
 * Plugin Name: MedConsult Price Sync
 * Description: Securely updates Supabase product prices and mirrors them to the Service Products ACF records.
 * Version: 1.1.2
 * Author: MedConsult IT
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Text Domain: medconsult-price-sync
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MCPS_VERSION', '1.1.2');
define('MCPS_FILE', __FILE__);
define('MCPS_DIR', plugin_dir_path(__FILE__));

require_once MCPS_DIR . 'includes/class-mcps-content-model.php';
require_once MCPS_DIR . 'includes/class-mcps-supabase-client.php';
require_once MCPS_DIR . 'includes/class-mcps-audit-log.php';
require_once MCPS_DIR . 'includes/class-mcps-promotion-prices.php';
require_once MCPS_DIR . 'includes/class-mcps-rest-controller.php';
require_once MCPS_DIR . 'includes/class-mcps-admin.php';
require_once MCPS_DIR . 'includes/class-mcps-plugin.php';

register_activation_hook(__FILE__, array('MCPS_Plugin', 'activate'));
add_action('plugins_loaded', array('MCPS_Plugin', 'boot'));
