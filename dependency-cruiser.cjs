/**
 * Dependency boundary rules for the ReqAtlas monorepo.
 *
 * Enforced by `pnpm arch` (dependency-cruiser). A violation exits non-zero.
 * See docs/engineering/README.md for the rationale behind each rule.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden anywhere in the workspace.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-no-frameworks',
      severity: 'error',
      comment:
        '@reqatlas/domain must stay framework-free: no NestJS, React, Drizzle, or pg driver.',
      from: { path: '^packages/domain/' },
      // 同时匹配已解析路径（node_modules/...）与无法解析时的裸模块名（如 `react`、`@nestjs/common`）。
      to: {
        path: '(^|/)node_modules/(@nestjs|react|react-dom|drizzle-orm|pg)(/|$)|^(@nestjs|react|react-dom|drizzle-orm|pg)(/|$)',
      },
    },
    {
      name: 'web-no-server-impl',
      severity: 'error',
      comment: 'apps/web must not import the database package or any NestJS server implementation.',
      from: { path: '^apps/web/' },
      // 同时覆盖相对/软链已解析路径与裸模块名。
      to: {
        path: '^(packages/db/|node_modules/@reqatlas/db/|node_modules/@nestjs/|@reqatlas/db(/|$)|@nestjs/)',
      },
    },
    {
      name: 'no-orphans-unused',
      severity: 'warn',
      comment: 'Report modules nothing depends on and that depend on nothing.',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)index\\.ts$', '(^|/)main\\.(ts|tsx)$', '\\.config\\.ts$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: 'node_modules|/dist/|/build/|/coverage/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
