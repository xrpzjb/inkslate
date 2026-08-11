import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MatIcon } from './MatIcon'
import { IonIcon } from './IonIcon'
import { useAppStore } from '../store/app'
import { matchNotebookIcon } from '@shared/notebookIcons'
import { toast } from './Toast'
import './IconPicker.css'

const ICON_CATEGORIES: { name: string; icons: string[] }[] = [
  { name: '全部', icons: [] as string[] },
  {
    name: '常用',
    icons: [
      'home', 'search', 'settings', 'person', 'folder', 'star', 'favorite_border',
      'bookmark', 'alarm', 'calendar_month', 'cloud', 'favorite', 'flag',
      'lightbulb', 'edit', 'delete', 'email', 'notifications', 'palette',
    ],
  },
  {
    name: '文档',
    icons: [
      'description', 'article', 'feed', 'note', 'note_add', 'sticky_note_2',
      'text_snippet', 'content_copy', 'content_cut', 'content_paste',
      'file_copy', 'file_present', 'file_download', 'file_upload',
      'folder', 'folder_open', 'folder_delete', 'folder_shared',
      'inventory', 'receipt', 'history', 'library_books', 'book',
    ],
  },
  {
    name: '编程',
    icons: [
      'code', 'code_off', 'terminal', 'bug_report', 'build',
      'developer_board', 'developer_board_off', 'developer_mode',
      'api', 'data_object', 'data_array', 'data_thresholding',
      'integration_instructions', 'javascript', 'css', 'html', 'php',
      'webhook', 'http', 'https', 'account_tree', 'commit',
      'fork_left', 'fork_right', 'alt_route', 'data_usage',
      'cloud_sync', 'dynamic_form', 'manage_search', 'route',
    ],
  },
  {
    name: '网络',
    icons: [
      'wifi', 'wifi_1_bar', 'wifi_2_bar', 'wifi_find', 'wifi_lock',
      'wifi_off', 'wifi_password', 'wifi_protected_setup',
      'wifi_tethering', 'bluetooth', 'bluetooth_connected',
      'bluetooth_disabled', 'bluetooth_searching',
      'network_check', 'network_ping', 'network_locked',
      'network_cell', 'network_wifi', 'cell_tower', 'cell_wifi',
      'signal_cellular_4_bar', 'signal_cellular_alt',
      'signal_cellular_off', 'signal_wifi_4_bar', 'signal_wifi_off',
      'lan', 'router', 'hub', 'dns', 'storage', 'cloud', 'cloud_queue',
      'cloud_done', 'cloud_upload', 'cloud_download', 'cloud_off',
      'cloud_circle', 'settings_ethernet', 'cast', 'cast_connected',
      'cast_for_education', 'connected_tv', 'vpn_key', 'vpn_key_off',
    ],
  },
  {
    name: '硬件',
    icons: [
      'laptop', 'laptop_mac', 'laptop_windows', 'laptop_chromebook',
      'desktop_mac', 'desktop_windows', 'computer', 'monitor',
      'tablet', 'tablet_mac', 'tablet_android', 'smartphone',
      'devices', 'devices_other', 'devices_fold', 'device_hub',
      'important_devices', 'memory', 'sd_card', 'sd_card_alert',
      'sd_storage', 'usb', 'usb_off', 'sim_card', 'sim_card_alert',
      'sim_card_download', 'keyboard', 'keyboard_alt',
      'keyboard_capslock', 'keyboard_command', 'keyboard_control',
      'keyboard_hide', 'keyboard_return', 'keyboard_tab',
      'keyboard_voice', 'mouse', 'adf_scanner', 'document_scanner',
      'print', 'scanner', 'power', 'power_input', 'power_off',
      'power_settings_new', 'battery_full', 'battery_charging_full',
      'battery_alert', 'battery_saver', 'battery_unknown',
      'bolt', 'electric_bolt', 'flash_on', 'flash_off', 'flash_auto',
      'hardware', 'nfc', 'contactless', 'watch',
    ],
  },
  {
    name: '安全',
    icons: [
      'security', 'security_update', 'security_update_good',
      'security_update_warning', 'shield', 'shield_moon',
      'verified_user', 'gpp_good', 'gpp_bad', 'gpp_maybe',
      'lock', 'lock_open', 'lock_outline', 'lock_clock',
      'lock_person', 'lock_reset', 'key', 'key_off', 'password',
      'fingerprint', 'privacy_tip', 'https', 'admin_panel_settings',
      'supervisor_account', 'manage_accounts', 'domain',
      'domain_add', 'domain_disabled', 'domain_verification',
      'vpn_lock', 'no_accounts', 'no_encryption_gmailerrorred',
    ],
  },
  {
    name: '数据',
    icons: [
      'dataset', 'dataset_linked', 'data_exploration',
      'data_saver_on', 'data_saver_off', 'analytics', 'insights',
      'query_stats', 'query_builder', 'data_usage',
      'storage', 'warehouse', 'inventory', 'backup', 'backup_table',
      'restore', 'restore_from_trash', 'download', 'download_done',
      'download_for_offline', 'downloading', 'upload', 'upload_file',
      'sync', 'sync_alt', 'sync_disabled', 'sync_lock', 'sync_problem',
      'import_export', 'cloud_sync', 'offline_bolt', 'speed',
      'online_prediction', 'model_training', 'on_device_training',
      'troubleshoot', 'science', 'biotech', 'data_thresholding',
    ],
  },
  {
    name: '应用',
    icons: [
      'apps', 'apps_outage', 'app_blocking', 'app_registration',
      'app_settings_alt', 'app_shortcut', 'widgets', 'now_widgets',
      'view_stream', 'window', 'splitscreen', 'fullscreen',
      'fullscreen_exit', 'close_fullscreen', 'open_in_new',
      'open_in_full', 'launch', 'rocket_launch', 'web', 'web_asset',
      'web_asset_off', 'web_stories', 'browser_not_supported',
      'browser_updated', 'install_desktop', 'install_mobile',
      'system_update', 'system_update_alt', 'grid_view',
      'space_dashboard', 'dashboard_customize', 'settings_suggest',
      'settings_input_antenna', 'settings_input_component',
      'settings_input_composite', 'settings_input_hdmi',
      'settings_input_svideo', 'settings_overscan',
    ],
  },
  {
    name: '通信',
    icons: [
      'chat', 'chat_bubble', 'chat_bubble_outline', 'comment', 'forum',
      'mail', 'mail_outline', 'send', 'message', 'sms',
      'call', 'phone', 'phone_forwarded', 'contact_mail', 'contact_phone',
      'email', 'markunread', 'forward_to_inbox', 'move_to_inbox',
    ],
  },
  {
    name: '媒体',
    icons: [
      'music_note', 'music_off', 'library_music', 'video_library',
      'videocam', 'videocam_off', 'movie', 'movie_creation', 'movie_filter',
      'play_arrow', 'play_circle', 'pause', 'pause_circle', 'stop',
      'skip_next', 'skip_previous', 'fast_forward', 'fast_rewind',
      'repeat', 'shuffle', 'volume_up', 'volume_down', 'volume_mute', 'volume_off',
      'headphones', 'headset', 'mic', 'mic_off', 'radio', 'album',
      'equalizer', 'graphic_eq', 'surround_sound', 'web_asset',
    ],
  },
  {
    name: '标志',
    icons: [
      'flag', 'flag_circle', 'bookmark', 'bookmark_border', 'label',
      'label_important', 'newspaper', 'grade', 'stars', 'emoji_events',
      'verified', 'verified_user', 'recommend', 'campaign',
      'notification_important', 'notifications_active', 'notifications_none',
      'notifications_off', 'notifications_paused', 'new_releases',
    ],
  },
  {
    name: '工具',
    icons: [
      'settings', 'build', 'construction', 'handyman', 'plumbing',
      'design_services', 'electrical_services', 'cleaning_services',
      'precision_manufacturing', 'miscellaneous_services',
      'troubleshoot', 'manage_search', 'manage_accounts',
      'manage_history', 'fact_check', 'task', 'task_alt',
    ],
  },
  {
    name: '形状',
    icons: [
      'circle', 'square', 'hexagon', 'pentagon', 'rectangle',
      'diamond', 'change_history', 'star', 'star_border', 'star_half',
      'favorite', 'favorite_border', 'heart_broken', 'incomplete_circle',
      'radio_button_checked', 'radio_button_unchecked',
      'check_box', 'check_box_outline_blank', 'toggle_off', 'toggle_on',
    ],
  },
  {
    name: '箭头',
    icons: [
      'arrow_back', 'arrow_forward', 'arrow_upward', 'arrow_downward',
      'chevron_left', 'chevron_right', 'expand_less', 'expand_more',
      'keyboard_arrow_down', 'keyboard_arrow_left', 'keyboard_arrow_right',
      'keyboard_arrow_up', 'navigate_before', 'navigate_next',
      'arrow_back_ios', 'arrow_forward_ios', 'arrow_circle_up',
      'arrow_circle_down', 'arrow_circle_left', 'arrow_circle_right',
      'first_page', 'last_page', 'subdirectory_arrow_left', 'subdirectory_arrow_right',
      'double_arrow', 'arrow_right_alt', 'arrow_left', 'arrow_right',
      'upgrade', 'launch', 'open_in_new', 'open_in_full', 'open_in_browser',
    ],
  },
  {
    name: '天气',
    icons: [
      'wb_sunny', 'light_mode', 'dark_mode', 'nights_stay',
      'cloud', 'cloud_queue', 'cloud_done', 'cloud_download', 'cloud_upload',
      'thunderstorm', 'water', 'ac_unit',
      'flood', 'tornado', 'landslide', 'tsunami', 'severe_cold',
      'thermostat', 'device_thermostat', 'air', 'wind_power',
    ],
  },
  {
    name: '食物',
    icons: [
      'restaurant', 'restaurant_menu', 'local_cafe', 'local_bar',
      'local_pizza', 'local_dining', 'cake', 'bakery_dining',
      'breakfast_dining', 'brunch_dining', 'dinner_dining', 'lunch_dining',
      'ramen_dining', 'rice_bowl', 'tapas', 'food_bank', 'free_breakfast',
      'icecream', 'egg', 'egg_alt', 'set_meal', 'soup_kitchen',
    ],
  },
  {
    name: '交通',
    icons: [
      'directions_car', 'local_taxi', 'directions_bus', 'directions_bike',
      'directions_walk', 'directions_boat', 'directions_railway',
      'directions_subway', 'train', 'tram', 'flight', 'flight_land',
      'flight_takeoff', 'local_airport', 'airport_shuttle',
      'departure_board', 'time_to_leave', 'ev_station', 'local_gas_station',
      'two_wheeler', 'electric_bike', 'electric_car', 'electric_scooter',
      'electric_rickshaw', 'electric_moped', 'bike_scooter', 'map',
      'navigation', 'near_me', 'my_location', 'explore',
    ],
  },
  {
    name: '动物',
    icons: [
      'pets', 'cruelty_free', 'bug_report', 'hive', 'grass',
      'nature', 'nature_people', 'park', 'forest', 'spa',
      'yard', 'compost', 'local_florist',
    ],
  },
  {
    name: '手势',
    icons: [
      'thumb_up', 'thumb_up_alt', 'thumb_up_off_alt',
      'thumb_down', 'thumb_down_alt', 'thumb_down_off_alt',
      'pan_tool', 'pan_tool_alt', 'front_hand', 'back_hand',
      'touch_app', 'handshake', 'waving_hand', 'punch_clock',
      'pinch', 'gesture', 'motion_photos_on',
    ],
  },
  {
    name: 'Ion 填充',
    icons: [
      'io:heart', 'io:star', 'io:settings', 'io:home', 'io:search',
      'io:person', 'io:mail', 'io:call', 'io:camera', 'io:lock-closed',
      'io:lock-open', 'io:bookmark', 'io:folder', 'io:folder-open',
      'io:cloud', 'io:cloud-done', 'io:cloudy', 'io:moon', 'io:sunny',
      'io:bulb', 'io:heart-circle', 'io:notifications', 'io:alarm',
      'io:calendar', 'io:cart', 'io:chatbox-ellipses', 'io:chatbubbles',
      'io:checkmark-circle', 'io:clipboard', 'io:calculator', 'io:code-slash',
      'io:cog', 'io:color-palette', 'io:compass', 'io:construct',
      'io:document', 'io:document-text', 'io:download', 'io:earth',
      'io:eye', 'io:file-tray', 'io:file-tray-full', 'io:film',
      'io:filter', 'io:flag', 'io:flame', 'io:flash', 'io:flashlight',
      'io:flower', 'io:football', 'io:funnel', 'io:game-controller',
      'io:gift', 'io:git-branch', 'io:git-commit', 'io:git-merge',
      'io:glasses', 'io:globe', 'io:hammer', 'io:headset', 'io:help-buoy',
      'io:home', 'io:hourglass', 'io:ice-cream', 'io:image', 'io:images',
      'io:infinite', 'io:information-circle', 'io:key', 'io:language',
      'io:laptop', 'io:layers', 'io:link', 'io:list', 'io:location',
      'io:magnet', 'io:map', 'io:medal', 'io:medical', 'io:medkit',
      'io:megaphone', 'io:menu', 'io:mic', 'io:musical-note',
      'io:navigate', 'io:newspaper', 'io:notifications', 'io:nuclear',
      'io:paper-plane', 'io:pause', 'io:paw', 'io:pencil', 'io:people',
      'io:pin', 'io:pizza', 'io:planet', 'io:play', 'io:power',
      'io:pricetag', 'io:print', 'io:pulse', 'io:qr-code', 'io:radio',
      'io:receipt', 'io:refresh', 'io:reload', 'io:restaurant',
      'io:ribbon', 'io:rocket', 'io:save', 'io:scale', 'io:scan',
      'io:school', 'io:send', 'io:server', 'io:share', 'io:shirt',
      'io:shuffle', 'io:skull', 'io:snow', 'io:sparkles', 'io:speedometer',
      'io:square', 'io:stats-chart', 'io:stopwatch', 'io:storefront',
      'io:subway', 'io:sync', 'io:pricetag', 'io:telescope', 'io:terminal',
      'io:text', 'io:thermometer', 'io:thumbs-down', 'io:thumbs-up',
      'io:thunderstorm', 'io:ticket', 'io:time', 'io:timer', 'io:toggle',
      'io:trash', 'io:trash-bin', 'io:trending-down', 'io:trending-up',
      'io:triangle', 'io:trophy', 'io:tv', 'io:umbrella', 'io:unlink',
      'io:eye-off', 'io:videocam', 'io:volume-high', 'io:volume-low',
      'io:volume-medium', 'io:volume-mute', 'io:walk', 'io:wallet',
      'io:warning', 'io:watch', 'io:water', 'io:wifi', 'io:wine',
      'io:woman', 'io:git-compare', 'io:git-pull-request',
      'io:git-network', 'io:code', 'io:code-working',
      'io:code-download', 'io:hardware-chip',
      'io:cloud-upload', 'io:cloud-download', 'io:cloud-offline',
      'io:cellular', 'io:bug',
      'io:cube', 'io:apps', 'io:grid', 'io:keypad',
      'io:shield-checkmark', 'io:shield-half',
      'io:desktop', 'io:phone-portrait', 'io:tablet-portrait',
      'io:bar-chart',
      'io:options', 'io:barcode',
    ]
  },
  {
    name: 'Ion 品牌',
    icons: [
      'io:logo-github', 'io:logo-gitlab', 'io:logo-bitbucket',
      'io:logo-javascript', 'io:logo-nodejs', 'io:logo-npm',
      'io:logo-html5', 'io:logo-css3', 'io:logo-python',
      'io:logo-react', 'io:logo-angular', 'io:logo-vue',
      'io:logo-docker', 'io:logo-electron', 'io:logo-firebase',
      'io:logo-figma', 'io:logo-vercel', 'io:logo-amplify',
      'io:logo-sass', 'io:logo-markdown', 'io:logo-stackoverflow',
      'io:logo-codepen', 'io:logo-hackernews', 'io:logo-pwa',
      'io:logo-capacitor', 'io:logo-ionic', 'io:logo-stencil',
      'io:logo-web-component', 'io:logo-google', 'io:logo-microsoft',
      'io:logo-apple', 'io:logo-android', 'io:logo-windows',
      'io:logo-chrome', 'io:logo-firefox', 'io:logo-edge',
      'io:logo-tux', 'io:logo-tableau', 'io:logo-slack',
      'io:logo-discord', 'io:logo-medium', 'io:logo-buffer',
    ]
  },
  {
    name: 'Ion 轮廓',
    icons: [
      'io:heart-outline', 'io:star-outline', 'io:settings-outline',
      'io:home-outline', 'io:search-outline', 'io:person-outline',
      'io:mail-outline', 'io:call-outline', 'io:camera-outline',
      'io:lock-closed-outline', 'io:lock-open-outline',
      'io:bookmark-outline', 'io:folder-outline', 'io:folder-open-outline',
      'io:cloud-outline', 'io:cloud-done-outline', 'io:cloudy-outline',
      'io:moon-outline', 'io:sunny-outline', 'io:bulb-outline',
      'io:heart-circle-outline', 'io:notifications-outline',
      'io:alarm-outline', 'io:calendar-outline', 'io:cart-outline',
      'io:chatbox-ellipses-outline', 'io:chatbubbles-outline',
      'io:checkmark-circle-outline', 'io:clipboard-outline',
      'io:calculator-outline', 'io:code-slash-outline', 'io:cog-outline',
      'io:color-palette-outline', 'io:compass-outline',
      'io:construct-outline', 'io:document-outline',
      'io:document-text-outline', 'io:download-outline', 'io:earth-outline',
      'io:eye-outline', 'io:file-tray-outline', 'io:file-tray-full-outline',
      'io:film-outline', 'io:filter-outline', 'io:flag-outline',
      'io:flame-outline', 'io:flash-outline', 'io:flashlight-outline',
      'io:flower-outline', 'io:football-outline', 'io:funnel-outline',
      'io:game-controller-outline', 'io:gift-outline',
      'io:git-branch-outline', 'io:git-commit-outline',
      'io:git-merge-outline', 'io:glasses-outline', 'io:globe-outline',
      'io:hammer-outline', 'io:headset-outline', 'io:help-buoy-outline',
      'io:home-outline', 'io:hourglass-outline', 'io:ice-cream-outline',
      'io:image-outline', 'io:images-outline', 'io:infinite-outline',
      'io:information-circle-outline', 'io:key-outline',
      'io:language-outline', 'io:laptop-outline', 'io:layers-outline',
      'io:link-outline', 'io:list-outline', 'io:location-outline',
      'io:magnet-outline', 'io:map-outline', 'io:medal-outline',
      'io:medical-outline', 'io:medkit-outline', 'io:megaphone-outline',
      'io:menu-outline', 'io:mic-outline', 'io:musical-note-outline',
      'io:navigate-outline', 'io:newspaper-outline',
      'io:notifications-outline', 'io:nuclear-outline',
      'io:paper-plane-outline', 'io:pause-outline', 'io:paw-outline',
      'io:pencil-outline', 'io:people-outline', 'io:pin-outline',
      'io:pizza-outline', 'io:planet-outline', 'io:play-outline',
      'io:power-outline', 'io:pricetag-outline', 'io:print-outline',
      'io:pulse-outline', 'io:qr-code-outline', 'io:radio-outline',
      'io:receipt-outline', 'io:refresh-outline', 'io:reload-outline',
      'io:restaurant-outline', 'io:ribbon-outline', 'io:rocket-outline',
      'io:save-outline', 'io:scale-outline', 'io:scan-outline',
      'io:school-outline', 'io:send-outline', 'io:server-outline',
      'io:share-outline', 'io:shirt-outline', 'io:shuffle-outline',
      'io:skull-outline', 'io:snow-outline', 'io:sparkles-outline',
      'io:speedometer-outline', 'io:square-outline',
      'io:stats-chart-outline', 'io:stopwatch-outline', 'io:storefront-outline',
      'io:subway-outline', 'io:sync-outline', 'io:pricetag-outline',
      'io:telescope-outline', 'io:terminal-outline', 'io:text-outline',
      'io:thermometer-outline', 'io:thumbs-down-outline',
      'io:thumbs-up-outline', 'io:thunderstorm-outline',
      'io:ticket-outline', 'io:time-outline', 'io:timer-outline',
      'io:toggle-outline', 'io:trash-outline', 'io:trash-bin-outline',
      'io:trending-down-outline', 'io:trending-up-outline',
      'io:triangle-outline', 'io:trophy-outline', 'io:tv-outline',
      'io:umbrella-outline', 'io:unlink-outline', 'io:eye-off-outline',
      'io:videocam-outline', 'io:volume-high-outline',
      'io:volume-low-outline', 'io:volume-medium-outline',
      'io:volume-mute-outline', 'io:walk-outline', 'io:wallet-outline',
      'io:warning-outline', 'io:watch-outline', 'io:water-outline',
      'io:wifi-outline', 'io:wine-outline', 'io:woman-outline',
      'io:git-compare-outline', 'io:git-pull-request-outline',
      'io:git-network-outline', 'io:code-outline',
      'io:code-working-outline', 'io:code-download-outline',
      'io:hardware-chip-outline',
      'io:cloud-upload-outline', 'io:cloud-download-outline',
      'io:cloud-offline-outline', 'io:cellular-outline',
      'io:bug-outline', 'io:cube-outline',
      'io:apps-outline', 'io:grid-outline', 'io:keypad-outline',
      'io:shield-checkmark-outline', 'io:shield-half-outline',
      'io:desktop-outline',
      'io:phone-portrait-outline', 'io:tablet-portrait-outline',
      'io:bar-chart-outline',
      'io:options-outline',
      'io:barcode-outline',
    ]
  },
  {
    name: 'Ion Sharp',
    icons: [
      'io:heart-sharp', 'io:star-sharp', 'io:settings-sharp',
      'io:home-sharp', 'io:search-sharp', 'io:person-sharp',
      'io:mail-sharp', 'io:call-sharp', 'io:camera-sharp',
      'io:lock-closed-sharp', 'io:lock-open-sharp',
      'io:bookmark-sharp', 'io:folder-sharp', 'io:folder-open-sharp',
      'io:cloud-sharp', 'io:cloud-done-sharp', 'io:cloudy-sharp',
      'io:moon-sharp', 'io:sunny-sharp', 'io:bulb-sharp',
      'io:heart-circle-sharp', 'io:notifications-sharp',
      'io:alarm-sharp', 'io:calendar-sharp', 'io:cart-sharp',
      'io:chatbox-ellipses-sharp', 'io:chatbubbles-sharp',
      'io:checkmark-circle-sharp', 'io:clipboard-sharp',
      'io:calculator-sharp', 'io:code-slash-sharp', 'io:cog-sharp',
      'io:color-palette-sharp', 'io:compass-sharp',
      'io:construct-sharp', 'io:document-sharp',
      'io:document-text-sharp', 'io:download-sharp', 'io:earth-sharp',
      'io:eye-sharp', 'io:file-tray-sharp', 'io:file-tray-full-sharp',
      'io:film-sharp', 'io:filter-sharp', 'io:flag-sharp',
      'io:flame-sharp', 'io:flash-sharp', 'io:flashlight-sharp',
      'io:flower-sharp', 'io:football-sharp', 'io:funnel-sharp',
      'io:game-controller-sharp', 'io:gift-sharp',
      'io:git-branch-sharp', 'io:git-commit-sharp',
      'io:git-merge-sharp', 'io:glasses-sharp', 'io:globe-sharp',
      'io:hammer-sharp', 'io:headset-sharp', 'io:help-buoy-sharp',
      'io:home-sharp', 'io:hourglass-sharp', 'io:ice-cream-sharp',
      'io:image-sharp', 'io:images-sharp', 'io:infinite-sharp',
      'io:information-circle-sharp', 'io:key-sharp',
      'io:language-sharp', 'io:laptop-sharp', 'io:layers-sharp',
      'io:link-sharp', 'io:list-sharp', 'io:location-sharp',
      'io:magnet-sharp', 'io:map-sharp', 'io:medal-sharp',
      'io:medical-sharp', 'io:medkit-sharp', 'io:megaphone-sharp',
      'io:menu-sharp', 'io:mic-sharp', 'io:musical-note-sharp',
      'io:navigate-sharp', 'io:newspaper-sharp',
      'io:notifications-sharp', 'io:nuclear-sharp',
      'io:paper-plane-sharp', 'io:pause-sharp', 'io:paw-sharp',
      'io:pencil-sharp', 'io:people-sharp', 'io:pin-sharp',
      'io:pizza-sharp', 'io:planet-sharp', 'io:play-sharp',
      'io:power-sharp', 'io:pricetag-sharp', 'io:print-sharp',
      'io:pulse-sharp', 'io:qr-code-sharp', 'io:radio-sharp',
      'io:receipt-sharp', 'io:refresh-sharp', 'io:reload-sharp',
      'io:restaurant-sharp', 'io:ribbon-sharp', 'io:rocket-sharp',
      'io:save-sharp', 'io:scale-sharp', 'io:scan-sharp',
      'io:school-sharp', 'io:send-sharp', 'io:server-sharp',
      'io:settings-sharp', 'io:share-sharp', 'io:shirt-sharp',
      'io:shuffle-sharp', 'io:skull-sharp', 'io:snow-sharp',
      'io:sparkles-sharp', 'io:speedometer-sharp', 'io:square-sharp',
      'io:stats-chart-sharp', 'io:stopwatch-sharp', 'io:storefront-sharp',
      'io:subway-sharp', 'io:sync-sharp', 'io:pricetag-sharp',
      'io:telescope-sharp', 'io:terminal-sharp', 'io:text-sharp',
      'io:thermometer-sharp', 'io:thumbs-down-sharp',
      'io:thumbs-up-sharp', 'io:thunderstorm-sharp',
      'io:ticket-sharp', 'io:time-sharp', 'io:timer-sharp',
      'io:toggle-sharp', 'io:trash-sharp', 'io:trash-bin-sharp',
      'io:trending-down-sharp', 'io:trending-up-sharp',
      'io:triangle-sharp', 'io:trophy-sharp', 'io:tv-sharp',
      'io:umbrella-sharp', 'io:unlink-sharp', 'io:eye-off-sharp',
      'io:videocam-sharp', 'io:volume-high-sharp',
      'io:volume-low-sharp', 'io:volume-medium-sharp',
      'io:volume-mute-sharp', 'io:walk-sharp', 'io:wallet-sharp',
      'io:warning-sharp', 'io:watch-sharp', 'io:water-sharp',
      'io:wifi-sharp', 'io:wine-sharp', 'io:woman-sharp',
      'io:git-compare-sharp', 'io:git-pull-request-sharp',
      'io:git-network-sharp', 'io:code-sharp',
      'io:code-working-sharp', 'io:code-download-sharp',
      'io:hardware-chip-sharp',
      'io:cloud-upload-sharp', 'io:cloud-download-sharp',
      'io:cloud-offline-sharp', 'io:cellular-sharp',
      'io:bug-sharp', 'io:cube-sharp',
      'io:apps-sharp', 'io:grid-sharp', 'io:keypad-sharp',
      'io:shield-checkmark-sharp', 'io:shield-half-sharp',
      'io:desktop-sharp',
      'io:phone-portrait-sharp', 'io:tablet-portrait-sharp',
      'io:bar-chart-sharp',
      'io:options-sharp',
      'io:barcode-sharp',
    ]
  },
]

export interface IconPickerProps {
  notebookId: string
  currentIcon: string | null | undefined
  onClose: () => void
}

export function IconPicker({ notebookId, currentIcon, onClose }: IconPickerProps) {
  const updateNotebook = useAppStore(s => s.updateNotebook)
  const notebooks = useAppStore(s => s.notebooks)
  const [selected, setSelected] = useState<string | null>(currentIcon ?? null)
  const [busy, setBusy] = useState(false)
  const [categoryIdx, setCategoryIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [fill, setFill] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const catScrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const allIcons = useMemo(() => {
    const set = new Set<string>()
    for (let i = 1; i < ICON_CATEGORIES.length; i++) {
      for (const icon of ICON_CATEGORIES[i].icons) {
        set.add(icon)
      }
    }
    return Array.from(set)
  }, [])

  const currentCategory = categoryIdx === 0
    ? { name: '全部', icons: allIcons }
    : ICON_CATEGORIES[categoryIdx]
  const icons = currentCategory?.icons ?? []

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return icons
    const q = search.toLowerCase()
    return icons.filter(name => name.toLowerCase().includes(q))
  }, [icons, search])

  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    const seen = new Set<string>()
    const results: string[] = []
    for (let i = 1; i < ICON_CATEGORIES.length; i++) {
      for (const icon of ICON_CATEGORIES[i].icons) {
        if (seen.has(icon)) continue
        seen.add(icon)
        if (icon.toLowerCase().includes(q)) {
          results.push(icon)
        }
      }
    }
    return results
  }, [search])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (search && searchRef.current === document.activeElement) {
          setSearch('')
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, search])

  const handleAutoMatch = async () => {
    const nb = notebooks.find(n => n.id === notebookId)
    const icon = matchNotebookIcon(nb?.name ?? '')
    if (!icon) {
      toast.info(`「${nb?.name ?? ''}」未匹配到合适图标`)
      return
    }
    setBusy(true)
    try {
      setSelected(icon)
      await updateNotebook(notebookId, { icon })
      toast.success('已按名称自动匹配图标')
    } catch (e) {
      console.error('Failed to auto-match notebook icon:', e)
      toast.error('自动匹配失败：' + ((e as Error)?.message || '未知错误'))
    } finally {
      setBusy(false)
      onClose()
    }
  }

  const handlePick = async (iconName: string | null) => {
    const stored = iconName
      ? (iconName.startsWith('io:') ? iconName : `mat:${iconName}${fill ? ':fill' : ''}`)
      : null
    setSelected(stored)
    setBusy(true)
    try {
      await updateNotebook(notebookId, { icon: stored })
    } catch (e) {
      console.error('Failed to update notebook icon:', e)
      toast.error('图标更新失败：' + ((e as Error)?.message || '未知错误'))
    } finally {
      onClose()
    }
  }

  const scrollCat = (dir: 'left' | 'right') => {
    const el = catScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' })
  }

  const displayIcons = searchResults ?? filteredIcons

  return createPortal(
    <div
      ref={wrapRef}
      className="notebook-icon-picker"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="notebook-icon-picker-header">
        <span>选择图标</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="notebook-icon-picker-fill-toggle" title={fill ? '切换到轮廓' : '切换到填充'}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Fill</span>
            <button
              className={`notebook-icon-picker-fill-btn${fill ? ' active' : ''}`}
              onClick={() => setFill(!fill)}
            >
              <MatIcon name="format_color_fill" size={14} filled={fill} />
            </button>
          </label>
          <button className="notebook-icon-picker-close" onClick={onClose}>
            <MatIcon name="close" size={16} />
          </button>
        </div>
      </div>

      <div className="notebook-icon-picker-search">
        <MatIcon name="search" size={14} />
        <input
          ref={searchRef}
          type="text"
          placeholder="搜索图标..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button className="notebook-icon-picker-search-clear" onClick={() => setSearch('')}>
            <MatIcon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="notebook-icon-picker-categories-wrap">
        <button className="notebook-icon-picker-cat-scroll" onClick={() => scrollCat('left')}>
          <MatIcon name="chevron_left" size={12} />
        </button>
        <div className="notebook-icon-picker-categories" ref={catScrollRef}>
          {ICON_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              className={'notebook-icon-picker-cat-btn' + (idx === categoryIdx ? ' active' : '')}
              onClick={() => { setCategoryIdx(idx); setSearch('') }}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <button className="notebook-icon-picker-cat-scroll" onClick={() => scrollCat('right')}>
          <MatIcon name="chevron_right" size={12} />
        </button>
      </div>

      <div className="notebook-icon-picker-grid">
        {displayIcons.length === 0 && searchResults !== null && (
          <div className="notebook-icon-picker-empty">未找到匹配图标</div>
        )}
        {displayIcons.map(name => {
          const isIo = name.startsWith('io:')
          const storedName = isIo ? name : `mat:${name}${fill ? ':fill' : ''}`
          const isSelected = selected === storedName
          const displayName = isIo ? name.slice(3) : name
          return (
            <button
              key={storedName}
              className={'notebook-icon-picker-item' + (isSelected ? ' selected' : '')}
              onClick={() => handlePick(name)}
              title={displayName}
              disabled={busy}
            >
              {isIo ? <IonIcon name={displayName} size={32} /> : <MatIcon name={name} size={32} filled={fill} />}
            </button>
          )
        })}
      </div>

      <div className="notebook-icon-picker-footer">
        <button
          className="notebook-icon-picker-auto"
          onClick={handleAutoMatch}
          disabled={busy}
        >
          按名称自动匹配
        </button>
        <button
          className="notebook-icon-picker-clear"
          onClick={() => handlePick(null)}
          disabled={busy || !currentIcon}
        >
          使用默认图标
        </button>
      </div>
    </div>,
    document.body
  )
}
