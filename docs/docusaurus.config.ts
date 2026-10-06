import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Magic Chess',
  tagline: 'Fully on-chain chess on Solana, with gasless moves on MagicBlock Ephemeral Rollups',
  favicon: 'img/favicon.png',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://amalnathsathyan.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/magic-chess/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'amalnathsathyan', // Usually your GitHub org/user name.
  projectName: 'magic-chess', // Usually your repo name.

  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/amalnathsathyan/magic-chess/tree/dev/docs/',
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
    navbar: {
      title: 'Magic Chess',
      logo: {
        alt: 'Magic Chess Logo',
        src: 'img/logo-light.svg',
        srcDark: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://arena.chessmagic.workers.dev',
          label: 'Play',
          position: 'right',
        },
        {
          href: 'https://github.com/amalnathsathyan/magic-chess',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/docs/'},
            {label: 'How to play', to: '/docs/getting-started/how-to-play'},
            {label: 'Architecture', to: '/docs/architecture/overview'},
            {label: 'SDK', to: '/docs/build/sdk'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'Play ZUG Arena', href: 'https://arena.chessmagic.workers.dev'},
            {label: 'GitHub', href: 'https://github.com/amalnathsathyan/magic-chess'},
            {label: 'Report a vulnerability', href: 'https://github.com/amalnathsathyan/magic-chess/security/advisories/new'},
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Magic Chess contributors. MIT licensed.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
