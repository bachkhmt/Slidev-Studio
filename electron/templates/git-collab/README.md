# Bài thuyết trình cộng tác

Mỗi người sửa một file trong `sections/` và asset trong `sections-assets/<id>/`.
Điều phối quản lý `slides.md`, cấu hình chung, phân công và quy tắc duyệt bài.

## Thiết lập lần đầu (điều phối)

1. Kiểm tra tài khoản GitHub trong `slidev-collab.json` và `.github/CODEOWNERS`.
2. Đăng ký [GitHub OAuth App](https://github.com/settings/applications/new), bật **Enable Device Flow**, cung cấp Client ID cho nhóm. Homepage URL có thể dùng URL repository ứng dụng; Authorization callback URL điền `http://localhost/callback` (Device Flow không gọi callback). Nếu có **Expire user access tokens**, bỏ chọn cho bản hiện tại vì ứng dụng chưa tự làm mới token. Client ID là mã công khai; ứng dụng không cần Client Secret. Với repository thuộc organization, chủ organization có thể cần phê duyệt OAuth App.
3. Tạo repository GitHub và mời các thành viên có quyền ghi. Đưa dự án này lên nhánh `main`:

```sh
git config user.name "Tên của bạn"
git config user.email "email của bạn"
# Chỉ chạy add/commit nếu ứng dụng chưa tạo bản đầu tiên.
git add .
git commit -m "Khởi tạo bài thuyết trình cộng tác"
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

4. GitHub Settings → Branches / Rulesets: bảo vệ `main`, yêu cầu Pull Request, ít nhất một review, review từ CODEOWNERS, và check `validate` thành công. Điều phối cũng là code owner của từng section để có thể duyệt bài khi người phụ trách chính là tác giả PR. Bảo vệ thay đổi `.github/`, manifest và cấu hình bằng review của điều phối. CI dùng phân công và script từ **nhánh gốc**, không dùng manifest tự sửa trong PR.
5. Settings → Pages → Source **GitHub Actions** để bật công bố bản tổng sau khi duyệt. Nếu đổi `mainBranch`, đổi nhánh tương ứng trong workflow `pages.yml`.

## Thành viên dùng Slidev Studio

1. Đăng nhập GitHub từ trang Home bằng Client ID của nhóm. Ứng dụng mở trang GitHub để nhập mã xác nhận. Thông tin đăng nhập được mã hoá qua keychain/keyring, không nằm trong JSON dự án.
2. Mở dự án từ URL HTTPS GitHub hoặc thư mục đã clone.
3. Chọn phần phụ trách. Các phần của người khác và file chung chỉ được xem; GitHub vẫn là nơi quản lý quyền thật.
4. Sửa Markdown, xem **phần của tôi** hoặc **bản tổng**. Preview dùng nhánh đang làm; bản tổng này có thể chứa nháp chưa được duyệt của bạn.
5. **Lưu nháp** tạo lịch sử trên máy. **Đồng bộ** lấy bản mới từ nhóm; cần lưu nháp trước. **Gửi bài** lưu, đẩy lên GitHub và tạo/cập nhật bài gửi để điều phối duyệt.
6. Xem trạng thái hoặc mở bài gửi trên GitHub. Trạng thái bản mới dựa trên lần Đồng bộ/Gửi bài gần nhất; Cập nhật trạng thái chỉ đọc dữ liệu trên máy và trạng thái PR.
7. **Xuất bản tổng** tạo PDF/PPTX/web tĩnh từ phiên bản mới nhất của `main` trên origin, giữ nguyên section/nháp của bạn. Kết quả ở `export/main.pdf`, `export/main.pptx` hoặc `export/main-web/`.

Khi bản mới xung đột, chọn **Giữ bản của tôi / Lấy bản mới**, hoặc sửa dấu xung đột trong Editor và bấm **Hoàn tất đồng bộ**. Mọi thao tác thay nội dung có xác nhận. Xung đột file chung, xoá/đổi tên cần điều phối hoặc công cụ Git; có thể **Huỷ đồng bộ** để trở lại bản nháp trước đó.

## Chạy bằng CLI

Cần Node 22.12+, Git và quyền truy cập GitHub. Ứng dụng kiểm tra Node/Git trong Settings; installer chưa đóng gói Git riêng.

```sh
npm install
npm run dev
# Vào nhánh section của bạn:
git fetch origin
git switch -c feature/LOGIN-01-intro origin/main
# Chạy preview độc lập ở gốc để giữ setup/, fonts, public/, local theme:
npx slidev .slidev-collab-01-intro.md
# Ứng dụng tạo file này khi chọn preview section. Các wrapper previews/ là ví dụ src.
```

Theme, fonts, addons và cấu hình toàn cục đặt ở headmatter của `slides.md`.
Section chỉ chứa nội dung và frontmatter từng slide như `layout`, `class`, `background`.
Ảnh nên dùng đường dẫn tương đối từ section tới thư mục asset của mình, ví dụ `../sections-assets/01-intro/chart.png`.
Không đưa token vào URL origin hoặc commit. Dùng origin HTTPS trên `github.com` cho Device Flow.

## Điều phối đổi cấu trúc

Tạo nhánh riêng bằng Git/GitHub, sửa manifest, `slides.md`, CODEOWNERS và wrapper ví dụ; gửi PR và thông báo cả nhóm đồng bộ. Giao diện thành viên không sửa cấu hình chung. Không tự đổi chủ section khi còn bài gửi chưa xử lý.

## Giới hạn beta

GitHub.com, một chủ/section, một bài/repo; preview và export cần cài thư viện dự án và Chromium. Đăng nhập cần OAuth App thật, bảo vệ nhánh và Pages cần cấu hình trên GitHub. Việc ký installer, tự cập nhật và kiểm thử với nhóm thật thuộc giai đoạn phát hành; mẫu không tự cấp quyền hoặc bật các cài đặt đó.
