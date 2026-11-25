//! Who may talk to the local HTTP servers (MCP on 27420, OBS on 27421).
//!
//! Any web page can make the browser send requests to 127.0.0.1. Browsers mark those requests: they carry
//! the page's `Origin` and a `Sec-Fetch-Site` header, and a page that re-points its own domain name at
//! 127.0.0.1 ("DNS rebinding") also sends its own name as `Host`. Programs on this computer (MCP clients,
//! curl, OBS's browser source showing our own page) send none of these, or loopback values.

/// The request headers that tell apart this computer's own programs from web pages.
#[derive(Debug, Default, Clone)]
pub struct RequestOrigin {
    pub host: Option<String>,
    pub origin: Option<String>,
    pub fetch_site: Option<String>,
}

impl RequestOrigin {
    /// Feed one `name: value` header line; the others are ignored.
    pub fn read_header(&mut self, line: &str) {
        let Some((name, value)) = line.split_once(':') else {
            return;
        };
        let name = name.trim();
        let value = value.trim().to_string();
        if name.eq_ignore_ascii_case("host") {
            self.host = Some(value);
        } else if name.eq_ignore_ascii_case("origin") {
            self.origin = Some(value);
        } else if name.eq_ignore_ascii_case("sec-fetch-site") {
            self.fetch_site = Some(value);
        }
    }

    /// True for this computer's own programs and pages; false for anything a web page sent.
    pub fn is_local(&self) -> bool {
        if let Some(host) = &self.host {
            if !is_loopback_host(host) {
                return false;
            }
        }
        match &self.origin {
            Some(origin) => is_loopback_origin(origin),
            // Requests without an Origin that a page made all the same (images, scripts) say so here.
            None => !self
                .fetch_site
                .as_deref()
                .is_some_and(|site| site.eq_ignore_ascii_case("cross-site") || site.eq_ignore_ascii_case("same-site")),
        }
    }

    /// CORS headers for a local page on another port; none for everyone else.
    pub fn cors_headers(&self) -> String {
        match &self.origin {
            Some(origin) if is_loopback_origin(origin) => format!(
                "Access-Control-Allow-Origin: {}\r\nVary: Origin\r\n",
                origin
            ),
            _ => String::new(),
        }
    }
}

/// `127.0.0.1`, `localhost` or `[::1]`, with or without a port.
pub fn is_loopback_host(host: &str) -> bool {
    let host = host.trim().to_ascii_lowercase();
    let name = if let Some(rest) = host.strip_prefix('[') {
        match rest.split_once(']') {
            Some((inner, after)) if after.is_empty() || is_port(after) => return inner == "::1",
            _ => return false,
        }
    } else {
        match host.rsplit_once(':') {
            Some((name, port)) if is_port(&format!(":{port}")) => name.to_string(),
            Some(_) => return false,
            None => host,
        }
    };
    name == "127.0.0.1" || name == "localhost"
}

fn is_port(s: &str) -> bool {
    match s.strip_prefix(':') {
        Some(digits) => !digits.is_empty() && digits.len() <= 5 && digits.bytes().all(|c| c.is_ascii_digit()),
        None => false,
    }
}

/// `http://127.0.0.1:27421` and the like. `null` (sandboxed frames, files) is not local.
pub fn is_loopback_origin(origin: &str) -> bool {
    let origin = origin.trim();
    let rest = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"));
    match rest {
        Some(host) => !host.contains('/') && is_loopback_host(host),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(host: Option<&str>, origin: Option<&str>, site: Option<&str>) -> RequestOrigin {
        RequestOrigin {
            host: host.map(str::to_string),
            origin: origin.map(str::to_string),
            fetch_site: site.map(str::to_string),
        }
    }

    #[test]
    fn local_programs_get_through() {
        // MCP clients and curl
        assert!(req(Some("127.0.0.1:27420"), None, None).is_local());
        assert!(req(Some("localhost:27420"), None, None).is_local());
        assert!(req(None, None, None).is_local());
        // OBS showing our own page, and that page's own requests
        assert!(req(Some("127.0.0.1:27421"), None, Some("none")).is_local());
        assert!(req(Some("127.0.0.1:27421"), Some("http://127.0.0.1:27421"), Some("same-origin")).is_local());
        assert!(req(Some("[::1]:27421"), Some("http://[::1]:27421"), None).is_local());
        // A tool on another local port
        assert!(req(Some("127.0.0.1:27420"), Some("http://localhost:6274"), Some("cross-site")).is_local());
    }

    #[test]
    fn web_pages_are_turned_away() {
        assert!(!req(Some("127.0.0.1:27420"), Some("https://example.com"), Some("cross-site")).is_local());
        assert!(!req(Some("127.0.0.1:27420"), Some("null"), None).is_local());
        assert!(!req(Some("127.0.0.1:27420"), Some("http://127.0.0.1.evil.com"), None).is_local());
        assert!(!req(Some("127.0.0.1:27421"), None, Some("cross-site")).is_local());
        // DNS rebinding: a foreign name that resolves to 127.0.0.1
        assert!(!req(Some("evil.example:27420"), None, None).is_local());
        assert!(!req(Some("evil.example:27420"), Some("http://evil.example:27420"), Some("same-origin")).is_local());
        assert!(!req(Some("localhost.evil.example"), None, None).is_local());
        assert!(!req(Some("127.0.0.1:27420:1"), None, None).is_local());
    }

    #[test]
    fn cors_only_for_local_pages() {
        assert_eq!(req(None, Some("https://example.com"), None).cors_headers(), "");
        assert!(req(None, Some("http://localhost:6274"), None)
            .cors_headers()
            .starts_with("Access-Control-Allow-Origin: http://localhost:6274\r\n"));
    }
}
