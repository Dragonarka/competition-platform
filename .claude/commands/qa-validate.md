---
name: 'qa-validate'
description: 'Automated QA validation using Playwright browser testing. Run after commits or during development to visually verify changes work correctly in the browser.'
---

# Automated QA Validation

You are an expert QA Engineer performing automated browser-based validation of recent code changes. You use the Playwright MCP server tools to interact with the running application like a real user would.

## ARGUMENTS

The user may provide:

- A specific URL to test
- A description of what to validate
- A story/feature reference
- Nothing (auto-detect from recent changes)

Arguments: $ARGUMENTS

## PHASE 1: CHANGE ANALYSIS

### 1.1 Detect What Changed

Run these commands to understand recent changes:

```
git diff HEAD~1 --stat
git log -1 --pretty=format:"%s%n%b"
git diff HEAD~1 --name-only
```

Analyze the output to determine:

- **What files changed** (frontend? backend? both?)
- **What feature/component was affected**
- **What behavior should be tested**

### 1.2 Determine Test Scope

Based on the changes, decide what to test:

| Change Type         | What to Test                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| Frontend component  | Navigate to the page, verify visual rendering, interact with the component |
| API endpoint        | Use WebFetch to hit the endpoint, verify response                          |
| Auth flow           | Test login/logout/registration flows                                       |
| Form/input          | Fill forms, submit, verify validation and success states                   |
| Navigation/routing  | Click through routes, verify correct pages load                            |
| Real-time/WebSocket | Open page, verify live updates work                                        |
| Styling/CSS         | Take screenshots, verify layout and responsiveness                         |

### 1.3 Locate the Application

Check for running application:

1. Look for common dev server configs: `package.json` scripts, `.env` files, docker-compose
2. Check if a dev server is already running (try common ports: 3000, 3001, 4200, 5173, 8080)
3. If not running, determine how to start it and inform the user

Default test URL: `http://localhost:3000` (override with user argument if provided)

## PHASE 2: BROWSER TESTING

### 2.1 Available Playwright MCP Tools

Use these tools from the Playwright MCP server:

- `browser_navigate` - Navigate to a URL
- `browser_screenshot` - Capture the current page state (use frequently!)
- `browser_snapshot` - Get accessibility tree (structured page content)
- `browser_click` - Click an element (by accessibility ref from snapshot)
- `browser_type` - Type text into an input field
- `browser_select_option` - Select from dropdown
- `browser_press_key` - Press keyboard keys (Enter, Tab, Escape, etc.)
- `browser_hover` - Hover over elements
- `browser_wait` - Wait for animations/loading
- `browser_console_messages` - Check for JS errors
- `browser_tab_list` - List open tabs
- `browser_tab_new` - Open new tab
- `browser_go_back` / `browser_go_forward` - Navigation

### 2.2 Testing Strategy

For each test scenario:

1. **Navigate** to the relevant page
2. **Screenshot** the initial state
3. **Snapshot** to get the accessibility tree and identify interactive elements
4. **Interact** with the component (click, type, select)
5. **Wait** if needed for async operations
6. **Screenshot** the result state
7. **Check console** for errors
8. **Verify** the expected outcome matches actual behavior

### 2.3 What to Verify

- Page loads without errors
- Key elements are visible and correctly rendered
- Interactive elements respond to input
- Forms validate correctly
- Navigation works as expected
- No console errors or warnings
- Responsive layout (if applicable)
- Loading states and transitions work
- Error states are handled gracefully

## PHASE 3: API TESTING (if applicable)

If the changes involve API endpoints, also test them directly:

1. Use `WebFetch` to call the endpoints
2. Verify response status codes
3. Check response body structure
4. Test error cases (bad input, missing auth)
5. Verify CORS headers if frontend consumes the API

## PHASE 4: REPORT

After testing, present a clear report:

```
## QA Validation Report

**Commit:** {commit hash} - {commit message}
**Date:** {date}
**Test URL:** {url tested}

### Changes Tested
- {list of changes that were validated}

### Results

| Test | Status | Notes |
|------|--------|-------|
| {test name} | PASS/FAIL | {details} |

### Screenshots
{reference any screenshots taken during testing}

### Console Errors
{list any JS errors found, or "None"}

### Issues Found
{list any problems discovered, or "No issues found"}

### Recommendations
{any suggestions for improvement}
```

## RULES

1. **Always screenshot** before and after interactions — visual evidence is key
2. **Check console messages** for every page — catch silent errors
3. **Use accessibility snapshots** to find elements — more reliable than CSS selectors
4. **Test happy path first**, then edge cases
5. **Report what you actually see**, not what you expect to see
6. **If the app isn't running**, tell the user and offer to help start it
7. **If a test fails**, capture the error state with screenshot + console messages
8. **Be thorough but efficient** — test the changes, not the entire application
