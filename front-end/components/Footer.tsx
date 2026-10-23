import Image from "next/image";
import Link from "next/link";
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand">
            <Image src="/kalenbnakafl-logo.jpg" alt="" width={42} height={42} />
            <span className="brand-copy">
              <strong>Kalen Benakafil</strong>
              <span>Community NGO</span>
            </span>
          </div>
          <p className="lede">
            A practical community organization helping people turn care into useful local action.
          </p>
        </div>
        <div>
          <h3>Explore</h3>
          <div className="footer-links">
            <Link href="/about">Our story</Link>
            <Link href="/events">Upcoming events</Link>
            <Link href="/blog">Community news</Link>
            <Link href="/volunteer">Volunteer</Link>
          </div>
        </div>
        <div>
          <h3>Connect</h3>
          <div className="footer-links">
            <Link href="/contact">Send a message</Link>
            <a href="mailto:hello@kalenbnakafl.org">hello@kalenbnakafl.org</a>
            <span>We respond as soon as we can.</span>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Kalen Benakafil. All rights reserved.</span>
        <span>Built for community action.</span>
      </div>
    </footer>
  );
}
