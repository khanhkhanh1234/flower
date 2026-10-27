import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const idParam = z.object({ id });

export const productQuery = z.object({
  category: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
});

export const orderInput = z.object({
  customer: z.object({
    name: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(100),
    phone: z
      .string()
      .trim()
      .regex(/^(0|\+84)\d{9,10}$/, 'Số điện thoại không hợp lệ'),
    address: z.string().trim().min(5, 'Vui lòng nhập địa chỉ').max(300),
    note: z.string().trim().max(500).default(''),
  }),
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1, 'Giỏ hàng trống')
    .max(50),
});

export const loginInput = z.object({
  password: z.string().min(1).max(200),
});

const imageUrl = z
  .union([z.literal(''), z.url({ protocol: /^https?$/ }), z.string().regex(/^\/[\w\-./]+$/)])
  .nullable()
  .default(null)
  .transform((v) => v || null);

export const productInput = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).default(''),
  price: z.number().int().min(0).max(1_000_000_000),
  image_url: imageUrl,
  category_id: id.nullable().default(null),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  is_active: z.boolean().default(true),
});

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];

export const orderStatusInput = z.object({
  status: z.enum(ORDER_STATUSES),
});
