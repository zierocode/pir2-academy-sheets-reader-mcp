สร้างสำหรับ PiR2 Academy — Advanced Claude Cowork

# PiR2 Academy Sheets Reader MCP

MCP แบบ local และ read-only ที่ให้ Claude Desktop อ่านข้อมูลจาก Google Sheets ภายในขนาดที่ปลอดภัย ผ่าน Google project และ Google account ของผู้เรียนเอง

## ทำอะไรได้บ้าง

Bundle มี tools 5 ตัว:

- `google_auth_status` — ตรวจว่าเชื่อม Google พร้อมหรือยัง
- `connect_google` — เปิดหน้าขอสิทธิ์อ่าน Google Sheet
- `diagnose_google_setup` — ตรวจ setup และบอกวิธีแก้ที่ตรงกับสาเหตุ โดยไม่แสดง secret
- `get_spreadsheet_metadata` — อ่านชื่อไฟล์และข้อมูล Tab โดยไม่อ่าน cell values
- `read_sheet_sample` — อ่านตัวอย่างขนาดเล็กเพื่อดูโครงสร้างอย่างปลอดภัย
- `read_sheet_ranges` — อ่าน A1 ranges ที่ระบุภายในขนาดที่ปลอดภัย

ถ้าใช้งานไม่ได้ ให้พิมพ์ `ตรวจ Sheets MCP ให้หน่อย` เพื่อให้ Claude เรียก
`diagnose_google_setup` แล้วทำตาม `fixSteps` ที่คืนมาได้ทันที ตัว tool จะไม่คืน path,
client ID, client secret, project ID หรือ token ครับ

หลังติดตั้ง Extension ให้เริ่มจากเปิด Chat ใหม่และตรวจว่า Extension เป็น Enabled ก่อน
ปกติไม่ต้อง restart แต่ถ้า tool ยังไม่ปรากฏ ให้ Quit Claude Desktop ทั้งโปรแกรมแล้วเปิดใหม่หนึ่งครั้ง
(Windows ต้อง Quit จาก system tray ไม่ใช่ปิดเฉพาะหน้าต่าง)

MCP นี้แก้ สร้าง หรือลบ Spreadsheet ไม่ได้ และไม่ใช้ Google app, API key, remote MCP server หรือ OAuth broker ส่วนกลางของ PiR

## เตรียมก่อนเรียน

1. ติดตั้ง Claude Desktop เวอร์ชันปัจจุบันบน macOS หรือ Windows
2. ทำตาม [ตั้งค่า Google project ของตัวเอง](docs/setup-google-project.md) และดาวน์โหลด Desktop OAuth JSON
3. ดาวน์โหลดไฟล์ `.mcpb` และ `.sha256` คู่กันจาก Releases ของ repository นี้

บัญชี Google ของบริษัทอาจบล็อก third-party OAuth app หากผู้ดูแลระบบไม่อนุญาต ให้เตรียมบัญชี Google ส่วนตัวและ Sheet ตัวอย่างที่ไม่มีข้อมูลลับ

## ติดตั้งใน Claude Desktop

1. เปิดไฟล์ `.mcpb` ที่ดาวน์โหลด
2. ตรวจชื่อ **PiR2-Sheets-Reader** แล้วติดตั้ง
3. ตรง **ไฟล์ Google Desktop OAuth** เลือก JSON จาก Google project ของตัวเอง
4. เปิด task ใหม่ใน Claude แล้วพิมพ์ `ตรวจการเชื่อมต่อ Google Sheet`
5. หากยังไม่ connected ให้พิมพ์ `เชื่อม Google` และทำขั้นตอนใน Browser ให้เสร็จ

ขั้นตอนเหมือนกันบน macOS และ Windows ผู้เรียนไม่ต้องใช้ Terminal เก็บ OAuth JSON เป็นความลับ และห้าม upload เข้า Chat, GitHub, Slack หรือ shared drive

## ใช้งาน

แปะ Google Sheet URL ให้ Claude ได้เลย ใน Live Dashboard lab ตัว Skill จะเลือก Tab, KPI และกราฟให้เอง เมื่อข้อมูลใน Sheet เปลี่ยน ให้กด **Reload** บนแถบด้านบนของ Live Artifact เพื่ออ่านข้อมูลใหม่

อ่าน [Privacy และขอบเขตข้อมูล](docs/privacy.md) ก่อนใช้ข้อมูลธุรกิจจริง หากเชื่อมต่อไม่ได้ให้ดู [วิธีแก้ปัญหา](docs/troubleshooting.md)

## สำหรับ Maintainer

Architecture และ verification อยู่ใน [Architecture](docs/architecture.md) และ [Testing and evidence](docs/TESTING.md)

```sh
npm ci
npm run check
npm run build
npm run smoke
npm run audit:high
npm run audit:tooling
npm run scan:secrets
npm run bundle
npm run bundle:verify
```

อ่าน [CONTRIBUTING.md](CONTRIBUTING.md) ก่อนเปิด change และแจ้งช่องโหว่ผ่าน [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
