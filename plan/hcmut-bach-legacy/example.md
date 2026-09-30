---
theme: ./
layout: cover
title: Morphology-Aware Self-Supervised Representation Learning for 3D Knee MRI in Osteoarthritis Assessment
shortTitle: Morphology-Aware SSL for 3D Knee MRI
author: Group 07
institute: Ho Chi Minh University of Technology, HCMUT
date: September 15, 2026
---

---
layout: agenda
---

---
layout: section
title: Self-Supervised Learning dựa trên Image Reconstruction
short: SSL & Reconstruction
---

---

# Self-Supervised Learning dựa trên Image Reconstruction

Self-supervised learning (SSL) khai thác chính dữ liệu đầu vào để tạo tín hiệu giám sát,
cho phép mô hình học representation từ **unlabeled images** trước khi fine-tune cho downstream task.

$$
\boxed{\text{Image } X} \to \boxed{\text{Corrupt / Mask}} \to \boxed{\text{Encoder}} \to \boxed{\text{Decoder}} \to \boxed{\hat{X}}
$$

Mô hình được huấn luyện để khôi phục phần thông tin bị ẩn:

$$
\mathcal{L}_{rec} = D\left(X_{\mathrm{masked}}, \hat{X}_{\mathrm{masked}}\right)
$$

- Encoder phải khai thác **context, structure và semantic information** từ các vùng còn quan sát được.
- Sau pre-training, decoder có thể bỏ đi và **pretrained encoder** dùng cho classification, detection hoặc segmentation.

---

# Vấn đề đặt ra trong Reconstruction-based SSL

<Block type="alert" title="Vấn đề đặt ra">

Nếu phần bị che quyết định độ khó và lượng thông tin mà mô hình phải học,
thì **masking strategy** trở thành một thành phần quan trọng.

</Block>

- Mask quá dễ → mô hình reconstruct từ local redundancy mà không cần học representation mạnh.
- Mask quá khó → mất quá nhiều context, reconstruction thiếu thông tin hoặc không ổn định.

---

# Các phương pháp masking hiện tại

| Loại task đã giải quyết | Paper | Phương pháp áp dụng | Đã giải quyết |
|---|---|---|---|
| What to mask? + How hard should masking be? | AutoMAE | Mask generator khai thác attention từ pretrained ViT để sinh sample-specific patch weights. | Cân bằng information gain với reconstruction difficulty. |
| What to mask? + How hard should masking be? | HPM | Loss predictor học thứ tự reconstruction difficulty; tỉ lệ hard-patch tăng dần theo curriculum. | Tự động xác định hard patches và điều chỉnh độ khó theo tiến trình training. |
| What to mask? | ATMask | Tính inter-slice texture-variation map rồi tăng xác suất mask tại các patch có variation cao. | Không cần learned attention module hay semantic annotation. |

---
layout: section
title: Research Gap
---

---

# Research Gap

- **Random masking ignores spatially non-uniform morphological information.**
  Uniform patch sampling không phân biệt vùng đồng nhất và vùng giàu cấu trúc.
- **Learned adaptive masking introduces additional pre-training complexity.**
  Cần pretrained attention, teacher network hoặc loss predictor.
- **Existing lightweight strategies provide limited knee-specific guidance.**

---
layout: section
title: Structural Prior
---

---
subtitle: "1/7: Intensity normalization"
align: top
---

# Structural Prior Formulation

Let $X$ denote the preprocessed 3D knee MRI volume. The intensity is robustly normalized using percentiles:

$$
p_{\mathrm{low}} = P_{0.5}(X), \qquad p_{\mathrm{high}} = P_{99.5}(X)
$$

$$
\tilde{X}(x) = \frac{\operatorname{clip}\left(X(x), p_{\mathrm{low}}, p_{\mathrm{high}}\right) - p_{\mathrm{low}}}{p_{\mathrm{high}} - p_{\mathrm{low}}}
$$

where $\tilde{X}(x)\in[0,1]$ is the normalized intensity at voxel $x$.

---
layout: two-cols
---

# Đóng góp nghiên cứu

::left::

**Kế thừa**

1. Masked Image Modeling và Masked Autoencoder.
2. Chuyển tiếp cường độ và đặc trưng cấu trúc.
3. Masking có điều kiện.

::right::

**Đề xuất**

- Prior map theo từng bệnh nhân $A(X)$.
- Masking ngẫu nhiên có định hướng.
- Thiết kế lightweight, chuyên biệt cho 3D knee MRI.

---
layout: section
title: Kết luận
---

---

# Kết luận

<Block title="Mục tiêu chung">

Chọn **thông tin nào nên bị che**, kiểm soát **độ khó của nhiệm vụ** và xác định **spatial scale** phù hợp.

</Block>

<Block type="example" title="Đóng góp cốt lõi">

Prior độc lập với mô hình, không có tham số học, không thêm forward/backward pass.

</Block>
