# ตั้งค่า Google project ของตัวเอง

ผู้เรียนแต่ละคนใช้ Google Cloud project และ Google account ของตัวเอง คลาสนี้ไม่ใช้ OAuth application หรือ API key ส่วนกลางของ PiR

Workshop ใช้ publishing status แบบ **Testing** จึงเชื่อมได้เฉพาะ Google account ที่เพิ่มเป็น test user และ refresh token อาจหมดอายุหลัง 7 วัน หาก Google ขอให้เชื่อมใหม่ให้ authorize อีกครั้ง การ verify และ publish แบบ public production อยู่นอกขอบเขตคลาส เพราะ project นี้ใช้ส่วนตัวโดยผู้เรียน

## 1. สร้าง Project

1. เปิด [Google Cloud Console](https://console.cloud.google.com/)
2. เปิดเมนู project เลือก **New Project** และตั้งชื่อที่จำง่าย เช่น `my-sheets-reader`
3. ตรวจว่าเป็น project ของคุณเอง ไม่ใช่ของผู้สอน

## 2. เปิด Google Sheets API

1. ไปที่ **APIs & Services > Library**
2. ค้นหา **Google Sheets API**
3. กด **Enable**

MCP นี้ไม่ต้องใช้ Google Drive API

## 3. ตั้งค่า Google Auth Platform

Google อาจใช้ชื่อหน้า **Google Auth Platform**, **OAuth consent screen** หรือ **Branding** ตาม Console layout ปัจจุบัน

1. เปิด **Google Auth Platform**
2. ตั้ง **Branding** ด้วยชื่อ เช่น `My Sheets Reader`, support email และ developer contact email ของคุณ
3. ที่ **Audience** เลือก **External** และคง publishing status เป็น **Testing**
4. เพิ่ม Google account ที่จะใช้เรียนเป็น **test user**
5. ที่ **Data Access** เพิ่ม scope นี้เพียงรายการเดียว:

   `https://www.googleapis.com/auth/spreadsheets.readonly`

Scope นี้อ่าน Google Sheets ที่บัญชีมีสิทธิ์เข้าถึงได้ แต่แก้ไขไม่ได้ MCP จะอ่าน values เมื่อได้รับ Sheet URL หรือ spreadsheet ID ที่ระบุเท่านั้น

## 4. สร้าง Desktop Credentials

1. เปิด **Google Auth Platform > Clients**
2. เลือก **Create Client**
3. เลือก application type เป็น **Desktop app**
4. ตั้งชื่อ `PiR2 Sheets Reader` แล้วสร้าง
5. ดาวน์โหลด OAuth client JSON ไปไว้ใน folder ส่วนตัวที่หาเจอตอนติดตั้ง

ห้ามแปะค่าจากไฟล์นี้เข้า Claude ตัว Claude Desktop จะส่งเฉพาะ local file path ให้ MCP process ในเครื่อง

## 5. Checklist ก่อนเรียน

- Sign in บัญชี Google ที่เป็น test user ใน Browser ได้
- บัญชีเดียวกันเปิด Sheet ตัวอย่างได้
- OAuth client เป็น **Desktop app** ไม่ใช่ Web application
- เปิด Google Sheets API ใน project เดียวกับ OAuth client
- JSON ที่ดาวน์โหลดยังอยู่ใน Mac หรือ Windows ของตัวเอง

บัญชีบริษัทหรือโรงเรียนอาจถูกผู้ดูแลระบบบล็อก OAuth app ให้ตรวจล่วงหน้าหรือใช้บัญชีส่วนตัวกับข้อมูลตัวอย่างที่ไม่เป็นความลับ

## ทำไม Workshop ใช้ Testing

Testing เป็นวิธี setup แบบ learner-owned ที่สั้นที่สุดและไม่ต้องให้ PiR operate/verify app ส่วนกลาง ข้อแลกเปลี่ยนคือ refresh token อาจมีอายุ 7 วันและต้องเพิ่มบัญชีเป็น test user การเชื่อมใหม่เป็นเรื่องปกติและไม่ทำให้ข้อมูลหาย

เอกสารทางการ: [Create OAuth credentials](https://developers.google.com/workspace/guides/create-credentials), [Google Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [OAuth app state](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
