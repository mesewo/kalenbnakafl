"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { apiFetch, excerpt, formatDate, type PageResponse, type Post } from "@/lib/api";

export default function BlogPage() {
  const [result, setResult] = useState<PageResponse<Post>>({ items: [], page: 1, limit: 10, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<PageResponse<Post>>(`/posts?page=${page}&limit=10`)
      .then((data) => { if (active) setResult(data); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Unable to load community news"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  const hasNext = page * result.limit < result.total;
  return <><Navbar/><main id="main-content"><section className="page-hero"><div className="container"><span className="eyebrow">Community news</span><h1>Stories, ideas, and updates from the work.</h1><p>Follow what is happening, what people are learning, and where you can take part next.</p></div></section><section className="section"><div className="container">{loading?<div className="empty-state">Loading the latest stories…</div>:error?<div className="status status-error" role="alert">{error}</div>:result.items.length===0?<div className="empty-state">No published stories are available yet.</div>:<div className="grid-2">{result.items.map(post=><article className="card card-accent" key={post.id}><span className="meta">{formatDate(post.published_at||post.created_at)}</span><h2>{post.title}</h2><p>{excerpt(post.content,240)}</p><Link className="meta" href={`/blog/${post.slug}`}>Read the full note →</Link></article>)}</div>}<nav className="form-actions" aria-label="Blog pages" style={{justifyContent:"space-between",marginTop:"1.5rem"}}><button className="btn btn-outline" onClick={()=>setPage((current)=>Math.max(1,current-1))} disabled={page<=1||loading}>Previous</button><span className="meta">Page {page} of {Math.max(1,Math.ceil(result.total/result.limit))}</span><button className="btn btn-outline" onClick={()=>setPage((current)=>current+1)} disabled={!hasNext||loading}>Next</button></nav></div></section><section className="cta-band section"><div className="container cta-row"><h2>Have a story or idea to share?</h2><a className="btn btn-primary" href="/contact">Talk with us</a></div></section></main><Footer/></>;
}