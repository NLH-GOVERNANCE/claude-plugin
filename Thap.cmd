@echo off
rem Thap he thong tren may (phieu 98bd8b93). Bam dup de mo mot phien Claude Code ngoi o Thap, chay Sonnet.
rem Kenh "tower" cua plugin tinh-nlh day viec moi vao phien nay; phien chuyen moi viec toi dung phien dang ngoi o.
rem Co --dangerously-load-development-channels: kenh tu lam chua nam trong danh sach kenh Anthropic duyet san
rem (research preview), nen phai noi ro "toi dang thu kenh nay". Co chi bo qua danh sach do cho dung kenh
rem plugin:tinh-nlh@nlh-governance, sau mot hop hoi. Quyen duyet, dang nhap, luat to chuc giu nguyen.
rem Loi tat "Thap tinh NhiLe" tren Desktop (tao lan dau) va dong nhac trong cua so: scripts\tower-window.ps1.
rem Khong tu bat chay cung Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\tower-window.ps1"
rem NLH_TOWER=1: chi phien nay doc luong viec; cac phien Claude Code khac tren may khong doc.
set NLH_TOWER=1
cd /d "%~dp0.."
claude -n "Thap truc" --model sonnet --dangerously-load-development-channels plugin:tinh-nlh@nlh-governance "/loop 10m /tinh-nlh:thap"
