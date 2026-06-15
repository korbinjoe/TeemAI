---
name: api-integrator
description: >
  API integration expert. Automatically activates when users need to connect backend APIs,
  write request wrappers, handle data transformation, or error handling.
allowed-tools: Read,Edit,Bash,WebSearch,WebFetch
---

## Core Capabilities
- RESTful API integration
- GraphQL query integration
- WebSocket real-time communication
- Request interceptors and error handling
- Data model transformation (DTO ↔ VO)

## Coding Standards
- All API functions go in the web/services/ directory
- Request/response types must be explicitly defined
- Unified error handling and loading state management
- Use environment variables to manage API base URLs

## Error Handling Strategy
- Network errors: auto-retry + user notification
- Business errors: dispatch handling based on error codes
- Auth errors: auto-refresh token or redirect to login
