import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { formatDate, type Post } from "@/lib/api";

async function getPost(slug: string): Promise<Post | null> {
  const base = (process.env.API_INTERNAL_URL || "http://localhost:8080").replace(/\/$/, "");
  const response = await fetch(`${base}/api/posts/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load this story.");
  return response.json() as Promise<Post>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Story not found | Kalen Benakafil" };
  return { title: `${post.title} | Kalen Benakafil`, description: post.content.slice(0, 160) };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return (
    <>
      <Navbar />
      <main id="main-content">
        <section className="page-hero">
          <div className="container">
            <Link className="eyebrow" href="/blog">
              ← Community news
            </Link>
            <h1>{post.title}</h1>
            <p>
              {formatDate(post.published_at || post.created_at)}
              {post.author_name ? ` · ${post.author_name}` : ""}
            </p>
          </div>
        </section>
        <article className="section">
          <div className="container" style={{ maxWidth: "52rem" }}>
            <div className="lede" style={{ whiteSpace: "pre-wrap" }}>
              {post.content}
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
