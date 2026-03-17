// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, LocalResult, NaiveDate, NaiveDateTime, Offset, TimeZone, Utc};
use chrono_tz::Tz;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const DEFAULT_TIMEZONE: &str = "北京";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TimeZoneInfo {
    name: String,
    offset_minutes: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct CurrentTimeResult {
    timestamp: i64,
}

fn get_timezone_map() -> HashMap<String, Tz> {
    get_timezone_entries()
        .into_iter()
        .filter_map(|(name, timezone_id)| match timezone_id.parse::<Tz>() {
            Ok(timezone) => Some((name.to_string(), timezone)),
            Err(error) => {
                warn!(
                    "时区配置解析失败: name={}, id={}, error={}",
                    name, timezone_id, error
                );
                None
            }
        })
        .collect()
}

fn get_timezone_entries() -> Vec<(&'static str, &'static str)> {
    vec![
        ("UTC", "Etc/UTC"),
        ("巴黎", "Europe/Paris"),
        ("开罗", "Africa/Cairo"),
        ("莫斯科", "Europe/Moscow"),
        ("迪拜", "Asia/Dubai"),
        ("新德里", "Asia/Kolkata"),
        ("加德满都", "Asia/Kathmandu"),
        ("仰光", "Asia/Yangon"),
        ("曼谷", "Asia/Bangkok"),
        ("北京", "Asia/Shanghai"),
        ("东京", "Asia/Tokyo"),
        ("悉尼", "Australia/Sydney"),
        ("奥克兰", "Pacific/Auckland"),
        ("纽约", "America/New_York"),
        ("芝加哥", "America/Chicago"),
        ("丹佛", "America/Denver"),
        ("洛杉矶", "America/Los_Angeles"),
        ("圣保罗", "America/Sao_Paulo"),
        ("圣地亚哥", "America/Santiago"),
    ]
}

fn timezone_by_name(timezone_name: &str) -> Result<Tz, String> {
    let map = get_timezone_map();
    map.get(timezone_name)
        .copied()
        .ok_or_else(|| format!("无效的时区: {}", timezone_name))
}

fn timezone_offset_minutes_for_utc(
    timezone_name: &str,
    utc_time: DateTime<Utc>,
) -> Result<i32, String> {
    let timezone = timezone_by_name(timezone_name)?;
    let offset_seconds = timezone
        .offset_from_utc_datetime(&utc_time.naive_utc())
        .fix()
        .local_minus_utc();
    Ok(offset_seconds / 60)
}

fn timezone_offset_minutes(timezone_name: &str) -> Result<i32, String> {
    timezone_offset_minutes_for_utc(timezone_name, Utc::now())
}

fn resolve_timezone_name(timezone_name: Option<String>) -> String {
    let fallback = DEFAULT_TIMEZONE.to_string();
    let Some(name) = timezone_name.as_deref().map(str::trim) else {
        return fallback;
    };

    if name.is_empty() {
        return fallback;
    }

    if get_timezone_map().contains_key(name) {
        name.to_string()
    } else {
        fallback
    }
}

fn datetime_from_timestamp(timestamp: i64) -> Result<DateTime<Utc>, String> {
    if timestamp > 9999999999 {
        DateTime::from_timestamp_millis(timestamp).ok_or_else(|| "无效的时间戳".to_string())
    } else {
        DateTime::from_timestamp(timestamp, 0).ok_or_else(|| "无效的时间戳".to_string())
    }
}

fn parse_naive_datetime(datetime_str: &str) -> Result<NaiveDateTime, String> {
    let datetime_formats = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"];

    for format in &datetime_formats {
        if let Ok(naive_dt) = NaiveDateTime::parse_from_str(datetime_str, format) {
            return Ok(naive_dt);
        }
    }

    if let Ok(date) = NaiveDate::parse_from_str(datetime_str, "%Y-%m-%d") {
        return date
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| "无法解析时间格式，请使用 yyyy-MM-dd HH:mm:ss 格式".to_string());
    }

    Err("无法解析时间格式，请使用 yyyy-MM-dd HH:mm:ss 格式".to_string())
}

#[tauri::command]
fn get_timezone_list() -> Vec<TimeZoneInfo> {
    info!("调用 get_timezone_list");
    let mut seen_names = HashSet::new();
    let now = Utc::now();
    let mut list: Vec<TimeZoneInfo> = get_timezone_entries()
        .into_iter()
        .filter(|(name, _)| seen_names.insert(*name))
        .filter_map(|(name, timezone_id)| {
            let Ok(timezone) = timezone_id.parse::<Tz>() else {
                warn!("时区配置解析失败: name={}, id={}", name, timezone_id);
                return None;
            };
            let offset_minutes = timezone
                .offset_from_utc_datetime(&now.naive_utc())
                .fix()
                .local_minus_utc()
                / 60;
            Some(TimeZoneInfo {
                name: name.to_string(),
                offset_minutes,
            })
        })
        .collect();

    list.sort_by(|a, b| {
        if a.name == "UTC" {
            std::cmp::Ordering::Less
        } else if b.name == "UTC" {
            std::cmp::Ordering::Greater
        } else {
            a.offset_minutes
                .cmp(&b.offset_minutes)
                .then_with(|| a.name.cmp(&b.name))
        }
    });

    list
}

#[tauri::command]
fn get_current_time(timezone_name: Option<String>) -> Result<CurrentTimeResult, String> {
    let timezone_name = resolve_timezone_name(timezone_name);
    info!("调用 get_current_time: timezone_name={}", timezone_name);
    let _offset_minutes = timezone_offset_minutes(&timezone_name)?;

    let now = Utc::now();

    Ok(CurrentTimeResult {
        timestamp: now.timestamp_millis(),
    })
}

#[tauri::command]
fn timestamp_to_datetime(timestamp: i64, timezone_name: Option<String>) -> Result<String, String> {
    let timezone_name = resolve_timezone_name(timezone_name);
    info!(
        "调用 timestamp_to_datetime: timestamp={}, timezone_name={}",
        timestamp, timezone_name
    );
    let timezone = timezone_by_name(&timezone_name)?;
    let dt = datetime_from_timestamp(timestamp)?;
    let result_dt = dt.with_timezone(&timezone);

    Ok(result_dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

#[tauri::command]
fn datetime_to_timestamp(
    datetime_str: String,
    timezone_name: Option<String>,
) -> Result<i64, String> {
    let timezone_name = resolve_timezone_name(timezone_name);
    info!(
        "调用 datetime_to_timestamp: datetime_str={}, timezone_name={}",
        datetime_str, timezone_name
    );
    let timezone = timezone_by_name(&timezone_name)?;
    let dt = parse_naive_datetime(&datetime_str)?;

    match timezone.from_local_datetime(&dt) {
        LocalResult::Single(dt_with_tz) => Ok(dt_with_tz.timestamp_millis()),
        LocalResult::Ambiguous(earlier, _) => Ok(earlier.timestamp_millis()),
        LocalResult::None => Err("该本地时间在该时区不存在（夏令时切换）".to_string()),
    }
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("启动 Emice Tools 应用");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_timezone_list,
            get_current_time,
            timestamp_to_datetime,
            datetime_to_timestamp
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn datetime_from_seconds_timestamp_works() {
        let dt = datetime_from_timestamp(1704067200).unwrap();
        assert_eq!(dt.timestamp_millis(), 1704067200000);
    }

    #[test]
    fn datetime_from_millis_timestamp_works() {
        let dt = datetime_from_timestamp(1704067200123).unwrap();
        assert_eq!(dt.timestamp_millis(), 1704067200123);
    }

    #[test]
    fn datetime_from_invalid_timestamp_fails() {
        let result = datetime_from_timestamp(i64::MAX);
        assert!(result.is_err());
    }

    #[test]
    fn timezone_offset_lookup_works() {
        let utc = timezone_offset_minutes("UTC").unwrap();
        assert_eq!(utc, 0);
    }

    #[test]
    fn timezone_offset_lookup_invalid_fails() {
        let result = timezone_offset_minutes("Mars");
        assert!(result.is_err());
    }

    #[test]
    fn resolve_timezone_name_defaults_to_beijing() {
        assert_eq!(resolve_timezone_name(None), "北京");
        assert_eq!(resolve_timezone_name(Some("".to_string())), "北京");
        assert_eq!(resolve_timezone_name(Some("   ".to_string())), "北京");
        assert_eq!(resolve_timezone_name(Some("Mars".to_string())), "北京");
    }

    #[test]
    fn timestamp_to_datetime_supports_seconds_and_timezone() {
        let result = timestamp_to_datetime(1704067200, Some("北京".to_string())).unwrap();
        assert_eq!(result, "2024-01-01 08:00:00");
    }

    #[test]
    fn timestamp_to_datetime_uses_default_timezone_when_missing() {
        let result = timestamp_to_datetime(1704067200, None).unwrap();
        assert_eq!(result, "2024-01-01 08:00:00");
    }

    #[test]
    fn timestamp_to_datetime_uses_default_timezone_when_invalid() {
        let result = timestamp_to_datetime(1704067200, Some("Mars".to_string())).unwrap();
        assert_eq!(result, "2024-01-01 08:00:00");
    }

    #[test]
    fn datetime_to_timestamp_supports_multiple_formats() {
        let ts_full =
            datetime_to_timestamp("2024-01-01 00:00:00".to_string(), Some("UTC".to_string()))
                .unwrap();
        let ts_minute =
            datetime_to_timestamp("2024-01-01 00:00".to_string(), Some("UTC".to_string())).unwrap();
        let ts_date =
            datetime_to_timestamp("2024-01-01".to_string(), Some("UTC".to_string())).unwrap();

        assert_eq!(ts_full, 1704067200000);
        assert_eq!(ts_minute, 1704067200000);
        assert_eq!(ts_date, 1704067200000);
    }

    #[test]
    fn datetime_to_timestamp_invalid_datetime_fails() {
        let result = datetime_to_timestamp("not-a-date".to_string(), Some("UTC".to_string()));
        assert!(result.is_err());
    }

    #[test]
    fn datetime_to_timestamp_uses_default_timezone_when_missing() {
        let result = datetime_to_timestamp("2024-01-01 00:00:00".to_string(), None).unwrap();
        assert_eq!(result, 1704038400000);
    }

    #[test]
    fn datetime_to_timestamp_uses_default_timezone_when_invalid() {
        let result =
            datetime_to_timestamp("2024-01-01 00:00:00".to_string(), Some("Mars".to_string()))
                .unwrap();
        assert_eq!(result, 1704038400000);
    }

    #[test]
    fn timezone_list_has_no_duplicate_names() {
        let list = get_timezone_list();
        let mut names = HashSet::new();
        for tz in list {
            assert!(names.insert(tz.name));
        }
    }

    #[test]
    fn timezone_list_contains_half_hour_timezone() {
        let list = get_timezone_list();
        let india = list.iter().find(|tz| tz.name == "新德里").unwrap();
        assert_eq!(india.offset_minutes, 330);
    }

    #[test]
    fn timezone_offset_reflects_dst_changes() {
        let winter = Utc
            .with_ymd_and_hms(2024, 1, 15, 12, 0, 0)
            .single()
            .unwrap();
        let summer = Utc
            .with_ymd_and_hms(2024, 7, 15, 12, 0, 0)
            .single()
            .unwrap();
        let winter_offset = timezone_offset_minutes_for_utc("纽约", winter).unwrap();
        let summer_offset = timezone_offset_minutes_for_utc("纽约", summer).unwrap();
        assert_eq!(winter_offset, -300);
        assert_eq!(summer_offset, -240);
    }
}
