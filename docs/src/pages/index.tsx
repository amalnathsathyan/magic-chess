import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const features = [
  {
    title: 'Every move on-chain',
    body: 'An Anchor program validates each move against FIDE rules: castling, en passant, promotion, checkmate, stalemate and all automatic draws.',
  },
  {
    title: 'Gasless, instant play',
    body: 'Matches are delegated to a MagicBlock Ephemeral Rollup. Moves confirm in milliseconds and session keys remove wallet popups.',
  },
  {
    title: 'Wagers that settle themselves',
    body: 'Stakes stay in a program-owned escrow on Solana and pay out to the winner, or split on a draw, after the game.',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title="Docs" description={siteConfig.tagline}>
      <header className={styles.hero}>
        <div className="container">
          <Heading as="h1" className={styles.title}>
            {siteConfig.title}
          </Heading>
          <p className={styles.tagline}>{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to="/docs/">
              Read the docs
            </Link>
            <Link
              className="button button--secondary button--outline button--lg"
              href="https://arena.chessmagic.workers.dev">
              Play ZUG Arena
            </Link>
          </div>
        </div>
      </header>
      <main className="container margin-vert--xl">
        <div className="row">
          {features.map(({title, body}) => (
            <div key={title} className="col col--4 margin-bottom--lg">
              <Heading as="h3">{title}</Heading>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </main>
    </Layout>
  );
}
