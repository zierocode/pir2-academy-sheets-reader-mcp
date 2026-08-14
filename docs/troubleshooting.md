# วิธีแก้ปัญหา

เปิด task ใหม่ใน Claude แล้วพิมพ์ `ตรวจการเชื่อมต่อ Google Sheet` ใช้ข้อความที่ระบบตอบเป็นหลักก่อนเปลี่ยน settings

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| Google บอกว่า app ใช้ไม่ได้หรือ access ถูก block | บัญชียังไม่เป็น test user หรือผู้ดูแลบริษัทบล็อก OAuth app | เพิ่มบัญชีที่ **Audience > Test users** หากเป็น managed account ให้ถาม admin หรือใช้บัญชีส่วนตัวกับข้อมูลตัวอย่าง |
| `redirect_uri_mismatch` | Client ที่ดาวน์โหลดไม่ใช่ **Desktop app** | สร้าง Desktop app client ใหม่และเลือก JSON ใหม่ใน Claude Desktop |
| Login ได้ แต่ภายหลัง connection หมดอายุ | Testing refresh token อาจหมดอายุหลัง 7 วัน | พิมพ์ `เชื่อม Google` แล้ว authorize ใหม่ |
| `invalid_grant` หรือถูก revoke | Refresh token หมดอายุ ถูกยกเลิก หรือ project/client เปลี่ยน | เชื่อมใหม่ หากยังไม่ได้ให้ลบ Google Account connection เดิมก่อน |
| Browser เปิดแต่ Claude ไม่ connected | local loopback ถูกบล็อก ยกเลิก flow หรือมี connection ค้าง | ปิด consent tab ลองใหม่หนึ่งครั้ง และอนุญาต local-loopback ใน security software ห้ามเริ่มหลาย flow พร้อมกัน |
| เปิด Sheet ไม่ได้ | Google account ที่เชื่อมไม่มีสิทธิ์ | เปิด Sheet ด้วยบัญชีเดียวกันและขอ access จากเจ้าของ ห้ามแก้ด้วยการเปิด Sheet เป็น public |
| ไม่พบ Spreadsheet | URL/ID ผิด หรืออยู่คนละบัญชี | Copy URL เต็มจาก Sheet ที่เปิดอยู่แล้วลองใหม่ |
| Range ถูกปฏิเสธหรือข้อมูลไม่ครบ | คำขอเกิน safety limits | ใช้ช่วง A1 ที่เล็กลงหรือให้ Skill เตรียม summary range |
| Claude หา tools ไม่เจอ | Extension disabled, ติดตั้งไม่ครบ หรือ Claude Desktop ต้อง restart | เปิด extension settings, enable **PiR2-Sheets-Reader** แล้ว restart Claude Desktop |

## Safe reset

1. Remove access ของ app จาก third-party connections ใน Google Account
2. Restart Claude Desktop
3. พิมพ์ `เชื่อม Google` และทำ consent flow ใหม่หนึ่งครั้ง

ห้ามแก้ OAuth error ด้วยการโพสต์ credential JSON หรือ token ใน Chat/public issue หากรายงานปัญหาให้ใส่เฉพาะ error code และขั้นตอนที่ redact แล้ว
