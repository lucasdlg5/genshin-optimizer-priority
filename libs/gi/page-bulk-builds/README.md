# gi-page-bulk-builds

Bulk build selection and queue presentation for Genshin Optimizer.

The queue deliberately accepts a runner supplied by the optimizer. Until the
existing solver is exposed as a safe service, the page does not simulate
navigation or clicks; callers receive an explicit integration error instead.
