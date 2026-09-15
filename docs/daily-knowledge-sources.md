# Daily Knowledge source notes

- NASA Science homepage: https://science.nasa.gov/
- NASA Science RSS feed: https://science.nasa.gov/feed/
- The RSS feed returned current `<item>` entries with title, permalink, publication date, description, and content. Example permalink observed: https://science.nasa.gov/blogs/roman/2026/09/14/fuel-savings-double-potential-lifetime-for-nasas-roman-mission/
- Implementation uses the NASA feed for science-related subjects, extracts title/link/description, and passes exact candidate URLs to the AI prompt. The backend still performs HTTP source verification before marking content approved; if source fetch or verification fails, content remains unverified and is not published to students.
