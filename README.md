# Bull Productions Recovery

Recovery baseline created from the verified live deployment on 2026-08-10.

## Safety boundary

- The existing Vercel production project is NOT modified by this package.
- No secrets are included.
- The current live deployment remains the rollback/source-of-behaviour reference until parity is proven.
- Server credentials must remain in Vercel environment variables only.

## Verified live infrastructure

- Vercel project: `bull-productions`
- Vercel project id: `prj_omGWbBWWFUypd9Xwj38ZM0qcCkRY`
- Supabase project: `AnchorFrame AI Studio`
- Supabase ref: `vckshcnflbxnvzgmsnrg`
- Tables: `bp_props`, `bp_scenes`, `bp_cast`
- Storage bucket: `bull-props`

## Recovery phases

1. Freeze/record the live compatibility surface.
2. Create a GitHub source-of-truth repository.
3. Reconstruct the current frontend and serverless APIs without changing production.
4. Add multiview Cast on a feature branch.
5. Deploy preview and run parity tests.
6. Connect production only after explicit approval.
