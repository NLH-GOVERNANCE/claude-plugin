---
name: tai-lieu
description: Tìm, cất và dọn tài liệu trên 5 Drive "NLH ·" của công ty. Dùng khi người dùng hỏi "X ở đâu", "cho tôi link", "file … nằm đâu", nhờ "lưu file này vào việc …", "cất vào Drive", "đặt tên file sao cho đúng", hay nhờ "dọn thư mục này", "sắp xếp lại Drive", "chuyển nhà".
---

# Tài liệu trên Drive mới

Three jobs, done with the Google Drive and Google Sheets connectors of the user's own Claude account (they only see what the user can open). Everything below is instructions for you; answer the user in plain Vietnamese, short sentences, no file ids, no tool names.

## The map

- Index people keep: tab "Tài liệu lõi" of Sổ tài nguyên, spreadsheet `1-VAsIqWjMlJ-KMwVudxJ0v7oedMDJDqehUdG8EpBhqE`. Columns: Tên, Chủ đề, Link, Drive · ngăn, Ai thấy, Người giữ, Tình trạng, Ghi chú. Read it with the Sheets connector (`'Tài liệu lõi'!A:H`). Never edit it yourself; a missing row is a line in your answer, the keeper adds it.
- Five shared drives, one per group of people who may see:
  - NLH · Cả công ty `0APHclyvXZmBCUk9PVA`: everyone.
  - NLH · Hội đồng `0ANzNAhaH9WKtUk9PVA`: the 4 council members.
  - NLH · Văn phòng Holding `0APUuXEtCh5k2Uk9PVA`: Danh and the office (contracts, legal papers).
  - NLH · Nedu `0ADiDf06El5UYUk9PVA`: Nedu people.
  - NLH · Family Cloud `0AOiHThB968q_Uk9PVA`: the team building Nếp and the systems.
- Every drive has the same three drawers: `1 Đang làm` (work not done, one folder per task named exactly as the task title in Nếp), `2 Tra cứu` (the one live copy in use, no date in the name), `3 Lưu trữ` (dated snapshots and finished work, read only).
- Not a home: chat, a personal computer, My Drive, Telegram groups, artifact pages. Something there is "not stored yet".
- Customer and student data, passwords and keys never go on Drive or into chat; say where they live instead (the system of that team; the password vault, names only).

## 1. "X ở đâu": one sentence with a link that opens

1. Look in the index first; then search Drive (`search_files`, title words without the file type).
2. Before giving a link, check the user can open it: `get_file_metadata` on that file id with their connector. It works: give it. It fails, or the file is only in the index: do not give the link; say who grants access (Người giữ in the index; else the drive's group from the list above) in one sentence.
3. Answer: one sentence with the link, for example "Bản vẽ dòng chảy nằm ở NLH · Cả công ty, ngăn Tra cứu: <link>". Several versions: give the live one in `2 Tra cứu`, mention a snapshot only if asked for a date.
4. Nothing found: say so in one sentence and name who might have it. Never guess a link.

## 2. "Lưu file này vào việc …": right drive, right drawer, right name

1. Drive: by who should see it (list above). Unsure between two: ask one question with buttons, naming the people, not the drive id.
2. Drawer: draft or unfinished work goes in `1 Đang làm/<task title>` (create the folder with the exact task title if missing); the live copy in use goes in `2 Tra cứu`; a dated snapshot or finished work goes in `3 Lưu trữ`.
3. Name, for files people read: Vietnamese with diacritics, the words someone would type to find it, about 8 words at most. No date, no "v2", "bản cuối", "copy", no code like "NEP-02" or "NLH-KT-02", no team name (the drive already says it), no notes in brackets. Snapshot: `Tên · chốt 2026-10-29`. Thing tied to one day (meeting, class, weekly report): `Tên · 2026-10-29`. Dates are year-month-day.
4. The given name breaks a rule: propose the right name and say the reason in a few words, then use it once the user agrees. Example: "NEP-02 Ban ve Nep 1.0 2026-10-28" becomes "Bản vẽ Nếp · chốt 2026-10-28" if it is a snapshot, else "Bản vẽ Nếp".
5. Store it (`create_file`, or `update_file` with `parentId` and `title` when it is already on Drive), then write the link on the task in Nếp: `add_follow_up` on that ticket, kind `fact`, the link in `files` and in the body. Tell the user one sentence with the link.

## 3. "Dọn thư mục này": propose, wait for yes, move

1. List the folder. For each file propose one line: where to (drive, drawer, task folder) and the new name by the rules above. Duplicates or old copies: propose `3 Lưu trữ` with a dated name, never removal.
2. Show the list and ask once: move all, or pick lines. Do nothing before the user says yes.
3. Move with `update_file` (`parentId`, and `title` if renamed). Moving keeps the file id, so every old link still opens. Never copy and never delete or trash a file (D-0051), even when the user asks to "xoá cho gọn": say files are only moved, and propose `3 Lưu trữ` instead.
4. A move fails (no right to move in that drive): stop that line, say who can grant it, go on with the rest. End with one sentence: how many moved, how many waiting and why.

## Log every job (no file content)

After each job write one line to Nếp so the Monday "Chuyển nhà" message can measure the time from question to an opened link: `add_follow_up` on ticket `07edc527-096c-499b-a984-6df035ed4642`, kind `fact`, a short body, `details` `{ "drive_op": "find" | "store" | "move", "asked_at": ISO time of the user's message, "answered_at": ISO time of your answer, "found": true/false, "can_open": true/false, "drive": drive name, "drawer": 1/2/3, "count": files moved }`. Only names of drives and drawers, never file names or content. The user never hears about this line.
