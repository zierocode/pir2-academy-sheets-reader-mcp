# Set up your own Google project

Each learner uses a Google Cloud project owned by you and authorizes your own Google account. The course does not use a shared PiR OAuth application or shared API key.

This workshop path uses Google's **Testing** publishing status. Only the Google accounts you add as test users can connect. A Testing refresh token can expire after 7 days, so reconnect when Google asks. Verification and public production publishing are outside this course because the project is for the learner's personal use.

## 1. Create a project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select the project menu, choose **New Project**, and use a recognizable name such as `my-sheets-reader`.
3. Make sure this is your project, not the instructor's project.

## 2. Enable Google Sheets API

1. In the project, open **APIs & Services > Library**.
2. Search for **Google Sheets API**.
3. Open it and choose **Enable**.

Google Drive API is not required by this connector.

## 3. Configure Google Auth Platform

Google may label these pages **Google Auth Platform**, **OAuth consent screen**, or **Branding**, depending on the current Console layout.

1. Open **Google Auth Platform**.
2. Complete **Branding** with an app name such as `My Sheets Reader`, your support email, and your developer contact email.
3. Under **Audience**, choose **External** and keep the publishing status as **Testing**.
4. Add the Google account you will use in class as a **test user**.
5. Under **Data Access**, add only this scope:

   `https://www.googleapis.com/auth/spreadsheets.readonly`

This sensitive, read-only scope can see all Google Sheets accessible to the authorized account; it cannot edit them. The MCP tools still require an explicit Sheet URL or spreadsheet ID before reading values.

## 4. Create Desktop credentials

1. Open **Google Auth Platform > Clients**.
2. Choose **Create Client**.
3. Select application type **Desktop app**.
4. Name it `PiR2 Sheets Reader` and create it.
5. Download the OAuth client JSON file to a private folder you can find during installation.

Do not paste values from this file into Claude. Claude Desktop passes only the local file path to the local MCP process.

## 5. Check before class

- You can sign in to the test-user Google account in your normal browser.
- The practice Sheet is accessible to that same account.
- The OAuth client is a **Desktop app**, not Web application.
- The Google Sheets API is enabled in the same project as the OAuth client.
- The downloaded JSON remains on your own Mac or Windows PC.

For a work or school company-managed account, an administrator can block any OAuth app. Ask your admin in advance or use a personal Google account with non-confidential sample data.

## Why Testing is the workshop default

Testing is the shortest learner-owned setup and does not require PiR to operate or verify a shared app. The tradeoff is the 7-day refresh-token lifetime and the need to list each account as a test user. Reconnecting is expected, not a data-loss event.

Official references: [Create OAuth credentials](https://developers.google.com/workspace/guides/create-credentials), [Google Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), and [OAuth app state](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
