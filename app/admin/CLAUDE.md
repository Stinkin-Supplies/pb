# Admin Panel

`app/admin/layout.jsx` — requires Supabase auth + `user_profiles.role = 'admin'`. Several admin routes (canonical-matches, parts-timeline, review-queue) require `?token=$ADMIN_SECRET` in the URL.

Protected API routes check `lib/adminAuth.ts`.
