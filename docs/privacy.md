# Privacy และขอบเขตข้อมูล

## สิ่งที่อยู่ในเครื่อง

- MCP server ทำงานเป็น local process ของ Claude Desktop บนเครื่องผู้เรียน
- OAuth client JSON อยู่ที่ local path ที่เลือกตอนติดตั้ง
- Refresh token เก็บใน macOS Keychain หรือ Windows Credential Manager ภายใต้ service `pir2-academy-sheets-reader-mcp`
- ไม่มี PiR remote MCP server หรือ PiR-hosted OAuth broker

## สิทธิ์จาก Google

MCP ขอเฉพาะ read-only scope `https://www.googleapis.com/auth/spreadsheets.readonly` ไม่มี write tool จึงเปลี่ยน values, formatting, sharing หรือ ownership ไม่ได้

Google ให้อ่าน Sheets ทั้งหมดที่บัญชีนั้นเข้าถึงได้และ OAuth จำกัดเหลือ Sheet เดียวไม่ได้ เพื่อลดความเสี่ยง MCP จะไม่ list ไฟล์ใน Drive และอ่าน values เมื่อได้รับ Sheet URL หรือ spreadsheet ID ที่ระบุเท่านั้น ทุกคำขอยังมี limit ด้าน range, cell, row, column, byte และ response

## สิ่งที่ออกจากเครื่อง

OAuth และ Sheets API requests วิ่งจาก local MCP ไป Google โดยตรง Values ที่ tool อ่านจะถูกส่งกลับให้ Claude เป็น conversation tool result จึงอยู่ภายใต้เงื่อนไขบริการ Anthropic ที่เกี่ยวข้อง ห้ามใช้ข้อมูลลับ ข้อมูลกำกับดูแล หรือข้อมูลลูกค้า หากองค์กรยังไม่อนุมัติ

MCP ไม่ตั้งใจ log credentials, OAuth tokens, ชื่อ Sheet หรือ values และ CI/release bundles ไม่มี credential file ของผู้เรียน

## ยกเลิกการเข้าถึง

ไปที่ third-party connections ของ Google Account เลือก Sheets Reader app แล้ว remove access จากนั้น Google จะปฏิเสธ token เดิม หรือจะลบ local credential ที่ตรงกันใน Keychain Access/Windows Credential Manager ก็ได้

การถอน extension จาก Claude Desktop จะหยุด MCP แต่ไม่ได้ revoke สิทธิ์ที่ Google โดยอัตโนมัติ
