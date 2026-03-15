// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct TimeConversionResult {
    timestamp_10: Option<i64>,
    timestamp_13: Option<i64>,
    datetime_utc: String,
    datetime_local: String,
    datetime_custom: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CurrentTimeResult {
    timestamp_10: i64,
    timestamp_13: i64,
    datetime_utc: String,
    datetime_local: String,
}

// 获取当前时间
#[tauri::command]
fn get_current_time() -> CurrentTimeResult {
    let now = Utc::now();
    let local = Local::now();
    
    CurrentTimeResult {
        timestamp_10: now.timestamp(),
        timestamp_13: now.timestamp_millis(),
        datetime_utc: now.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        datetime_local: local.format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}

// 从时间戳转换
#[tauri::command]
fn convert_from_timestamp(timestamp: i64, timezone_offset: Option<i32>) -> Result<TimeConversionResult, String> {
    // 判断是10位还是13位时间戳
    let dt = if timestamp > 9999999999 {
        // 13位时间戳（毫秒）
        DateTime::from_timestamp_millis(timestamp)
            .ok_or_else(|| "Invalid timestamp".to_string())?
    } else {
        // 10位时间戳（秒）
        DateTime::from_timestamp(timestamp, 0)
            .ok_or_else(|| "Invalid timestamp".to_string())?
    };
    
    let utc_dt = dt.with_timezone(&Utc);
    let local_dt = dt.with_timezone(&Local);
    
    let custom_dt = if let Some(offset) = timezone_offset {
        // 创建自定义时区（以小时为单位的偏移）
        let offset_seconds = offset * 3600;
        let custom_tz = chrono::FixedOffset::east_opt(offset_seconds)
            .ok_or_else(|| "Invalid timezone offset".to_string())?;
        Some(utc_dt.with_timezone(&custom_tz).format("%Y-%m-%d %H:%M:%S %z").to_string())
    } else {
        None
    };
    
    Ok(TimeConversionResult {
        timestamp_10: Some(utc_dt.timestamp()),
        timestamp_13: Some(utc_dt.timestamp_millis()),
        datetime_utc: utc_dt.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        datetime_local: local_dt.format("%Y-%m-%d %H:%M:%S").to_string(),
        datetime_custom: custom_dt,
    })
}

// 从日期时间字符串转换
#[tauri::command]
fn convert_from_datetime(
    datetime_str: String,
    format: String,
    timezone_offset: Option<i32>,
) -> Result<TimeConversionResult, String> {
    // 尝试解析不同的时间格式
    let dt = if format == "auto" {
        // 自动检测常见格式
        parse_datetime_auto(&datetime_str)?
    } else {
        // 使用指定格式
        DateTime::parse_from_str(&datetime_str, &format)
            .map_err(|e| format!("Parse error: {}", e))?
            .with_timezone(&Utc)
    };
    
    // 如果提供了时区偏移，应用它
    let dt = if let Some(offset) = timezone_offset {
        let offset_seconds = offset * 3600;
        let tz = chrono::FixedOffset::east_opt(offset_seconds)
            .ok_or_else(|| "Invalid timezone offset".to_string())?;
        dt.with_timezone(&tz)
    } else {
        dt
    };
    
    let utc_dt = dt.with_timezone(&Utc);
    let local_dt = dt.with_timezone(&Local);
    
    Ok(TimeConversionResult {
        timestamp_10: Some(utc_dt.timestamp()),
        timestamp_13: Some(utc_dt.timestamp_millis()),
        datetime_utc: utc_dt.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        datetime_local: local_dt.format("%Y-%m-%d %H:%M:%S").to_string(),
        datetime_custom: None,
    })
}

use chrono::NaiveDateTime;

// 自动解析常见的时间格式
fn parse_datetime_auto(datetime_str: &str) -> Result<DateTime<Utc>, String> {
    let formats = vec![
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S UTC",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%.fZ",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
    ];
    
    for format in &formats {
        if let Ok(dt) = DateTime::parse_from_str(datetime_str, format) {
            return Ok(dt.with_timezone(&Utc));
        }
        if let Ok(dt) = NaiveDateTime::parse_from_str(datetime_str, format) {
            // 假设是本地时间，转换为 UTC
            return Ok(Local.from_local_datetime(&dt).single()
                .ok_or_else(|| "Invalid datetime".to_string())?
                .with_timezone(&Utc));
        }
    }
    
    Err("Unable to parse datetime string".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_current_time,
            convert_from_timestamp,
            convert_from_datetime
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

