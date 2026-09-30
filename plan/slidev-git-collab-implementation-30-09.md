# Triển khai cộng tác Slidev Studio — 30/09/2026

## Quyết định

- Tận dụng Electron/React/Monaco, quản lý tiến trình và export sẵn có.
- Git hệ thống (`execa`, không shell) thay vì thêm isomorphic-git. Giữ khả năng merge/conflict/worktree chuẩn; Node/Git được kiểm tra trong Settings.
- GitHub.com + OAuth Device Flow. Nhóm phải cung cấp Client ID của OAuth App đã bật Device Flow. Không nhúng Client Secret. Token lưu riêng bằng safeStorage, từ chối backend `basic_text` trên Linux.
- Một người mỗi section, bài gửi qua PR; điều phối đổi cấu trúc qua Git/GitHub.
- Slidev `53.0.0` cố định cho template cộng tác. Cấu hình theme/fonts lấy từ entry, section bị chặn đặt cấu hình toàn cục.
- Wrapper thực tế của ứng dụng nằm ở **gốc repo**, tên `.slidev-collab-<id>.md`, được bỏ qua cục bộ khi kiểm tra Git. Slidev lấy root dự án từ entry nên vị trí này giữ setup/, local theme, public/ và components/ đúng. `previews/*.md` giữ làm ví dụ cấu trúc `src`, không phải entry mà app chạy.
- Export dùng detached worktree từ `origin/<mainBranch>` sau fetch, giữ nguyên nhánh và thay đổi chưa gửi. Chỉ dùng lại node_modules khi package/lockfile giống bản tổng.

## Phần đã triển khai

- Parser manifest và kiểm tra đường dẫn, section/asset, nhánh và chủ sở hữu.
- Chọn vai trò, lưu nháp, fetch/merge, commit/push, tạo/tái sử dụng PR, trạng thái review/merge.
- Ghi file được kiểm tra trong main process; section khác và file chung chỉ xem trong editor.
- Kiểm tra cả thay đổi chưa commit và các commit trước khi gửi, dựa trên manifest của nhánh tổng.
- Hiển thị conflict, chọn hai bản có xác nhận, sửa thủ công, hoàn tất hoặc huỷ merge.
- Preview phần/tổng và export PDF/PPTX/web từ bản đã được duyệt.
- Template ba section, phân công qua wizard, CODEOWNERS/PR template, CI giới hạn file và build, workflow Pages.
- Hướng dẫn OAuth, bảo vệ nhánh, thử luồng CLI và giới hạn beta trong README của mẫu.

## Công việc phụ thuộc môi trường bên ngoài

- OAuth App/Client ID, repository và quyền thành viên thật.
- Branch protection/Rulesets và GitHub Pages.
- Smoke test đăng nhập và gửi PR với tài khoản thật.
- Kiểm thử Windows/Linux, thử với thành viên không biết Git.
- Installer được ký, tự cập nhật và phát hành (Phase 5); mở rộng Phase 6 nằm ngoài MVP.

## Tài liệu nguồn

- https://sli.dev/guide/syntax
- https://sli.dev/features/importing-slides.html
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
