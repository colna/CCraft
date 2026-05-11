import { ArrowRight, Bot, Boxes, Braces, Check, Cpu, MessageCircle, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { SignalField } from "../components/SignalField";
import {
  buildPillars,
  interactivePanels,
  productShowcase,
  studioPrinciples
} from "../content/site";

const showcaseIcons = [Bot, Boxes, MessageCircle, Wand2] as const;
const pillarIcons = [Cpu, Braces, Sparkles] as const;

export default function HomePage() {
  return (
    <>
      <section className="hero minimal-hero">
        <SignalField />

        <div className="hero-copy">
          <p className="eyebrow">DevChat Studio · AI Product Company</p>
          <h1>Intelligent products, designed with human taste.</h1>
          <p className="hero-subtitle">
            We build AI apps, digital products, and creative interfaces with the clarity of
            Apple and the intelligent motion of Google.
          </p>
          <p className="zh-line">我们打造智能应用、数字产品与 AI 驱动体验。英文为主，中文辅助。</p>
        </div>

        <div className="auth-card" aria-label="DevChat Studio command status">
          <div className="studio-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="auth-brand">DevChat Studio</p>
          <h2>You are ready to build.</h2>
          <p>
            Product context is loaded. Choose an app direction, generate a prototype, and keep
            every change reviewable.
          </p>
          <div className="auth-actions">
            <Link href="/download" className="button primary">
              Start building
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/features" className="button secondary">
              View features
            </Link>
          </div>
        </div>
      </section>

      <section className="section product-section">
        <div className="section-heading">
          <p className="eyebrow">Products · 产品</p>
          <h2>Focused app ideas, built for real workflows.</h2>
          <p>Minimal interfaces, useful AI, and interactions that feel responsive without noise.</p>
        </div>

        <div className="product-grid">
          {productShowcase.map((product, index) => {
            const Icon = showcaseIcons[index] ?? Bot;

            return (
              <article key={product.title} className="product-card">
                <div className="product-card-header">
                  <span className="icon-badge">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span>{product.metric}</span>
                </div>
                <p className="card-kicker">
                  {product.label} · {product.labelZh}
                </p>
                <h3>{product.title}</h3>
                <p>{product.description}</p>
                <p className="zh-card-copy">{product.descriptionZh}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section build-section">
        <div className="section-heading">
          <p className="eyebrow">What We Build · 我们构建什么</p>
          <h2>Technology that feels calm, fast, and close to people.</h2>
        </div>

        <div className="pillar-grid">
          {buildPillars.map((pillar, index) => {
            const Icon = pillarIcons[index] ?? Cpu;

            return (
              <article key={pillar.title} className="pillar-card">
                <Icon aria-hidden="true" size={26} />
                <span>{pillar.detail}</span>
                <h3>{pillar.title}</h3>
                <p className="zh-label">{pillar.titleZh}</p>
                <p>{pillar.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section philosophy-section">
        <div className="philosophy-copy">
          <p className="eyebrow">Design Philosophy · 设计哲学</p>
          <h2>Move quickly. Remove clutter. Keep the interaction alive.</h2>
          <p>
            The visual system stays quiet: white space, crisp type, light glass, soft color, and
            motion that responds to intent.
          </p>
        </div>
        <div className="principle-stack">
          {studioPrinciples.map((principle) => (
            <article key={principle.value} className="principle-card">
              <Check aria-hidden="true" size={18} />
              <div>
                <span>{principle.value}</span>
                <h3>{principle.title}</h3>
                <p className="zh-label">{principle.titleZh}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section interface-section">
        <div className="interface-copy">
          <p className="eyebrow">Interactive System · 动态系统</p>
          <h2>Motion follows the pointer, without stealing the page.</h2>
          <p>
            The hero field reacts to mouse movement with a quiet signal system. Cards keep the
            same restraint: small lift, clean shadows, and no visual clutter.
          </p>
        </div>
        <div className="interface-stage">
          <div className="stage-orbit" aria-hidden="true" />
          <div className="stage-command">
            <strong>Studio OS</strong>
            <p>Ask · prototype · review · ship</p>
          </div>
          {interactivePanels.map((panel, index) => (
            <article key={panel.title} className={`floating-panel panel-${index + 1}`}>
              <span>{panel.tone}</span>
              <h3>{panel.title}</h3>
              <p>{panel.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <div className="final-cta-content">
          <p className="eyebrow">Build with us · 一起构建</p>
          <h2>Bring a messy idea. Leave with a clear product direction.</h2>
          <div className="hero-actions">
            <Link href="/download" className="button primary">
              Open DevChat
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/docs" className="button secondary">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
