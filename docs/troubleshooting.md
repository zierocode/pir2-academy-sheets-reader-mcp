# Troubleshooting

Start a new Claude conversation and ask `Check Google Sheets connection`. Use the message returned by the tool before changing settings.

| Symptom | Likely cause | Recovery |
|---|---|---|
| Google says the app is unavailable or access is blocked | Your account is not a test user, or a company administrator blocks OAuth apps | Add the exact account under **Audience > Test users**. For a managed account, ask the admin or use a personal account with practice data. |
| `redirect_uri_mismatch` | The downloaded client is not application type **Desktop app** | Create a new Desktop app client and select its new JSON file in Claude Desktop. |
| Google login works, then connection expires later | A Testing refresh token can expire after the 7-day window | Ask Claude `Connect Google` and authorize again. |
| `invalid_grant` or authorization was revoked | The refresh token expired, was revoked, or the Google project/client changed | Ask Claude to connect again. If needed, remove the old Google Account connection first. |
| The browser opens but Claude never connects | Local loopback traffic was blocked, the browser flow was cancelled, or another connection is already pending | Close the consent tab, retry once, and allow local-loopback traffic in endpoint security software. Do not start several connection attempts. |
| Permission denied for one Sheet | The authorized Google account cannot access that Sheet | Open the Sheet in the same browser account and request access from its owner. Do not make the Sheet public. |
| Spreadsheet not found | The URL or ID is wrong, or belongs to another account | Copy the full URL from the open Sheet and retry. |
| Range rejected or response truncated | The request exceeded workshop safety limits | Request fewer tabs, a smaller A1 range, or use `read_sheet_sample` first. |
| Claude cannot find the tools | The extension is disabled, installation is incomplete, or Claude Desktop needs a restart | Re-open Claude Desktop's extension settings, enable **PiR2 Academy — Sheets Reader**, then restart Claude Desktop. |

## Safe reset

1. Remove the app's access from your Google Account third-party connections page.
2. Restart Claude Desktop.
3. Ask `Connect Google` and complete one fresh consent flow.

Never solve an OAuth error by posting the credential JSON or token in chat or a public issue. Public bug reports should contain only the error code and redacted reproduction steps.
