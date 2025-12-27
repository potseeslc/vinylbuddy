# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-12-26

### Added
- Initial release of Vinyl Buddy
- Continuous audio recognition using Shazam
- Last.fm scrobbling with deduplication
- Multi-architecture Docker support (AMD64/ARM64)
- Detailed setup instructions for Last.fm integration
- Privacy protection with automatic screen return after inactivity

### Fixed
- Duplicate scrobbling issues
- Architecture compatibility for Portainer deployment
- Variable reference errors in scrobbling logic

### Changed
- Updated docker-compose to use `:latest` tag
- Improved README with comprehensive Last.fm setup instructions
- Added session key generation script for easier setup
