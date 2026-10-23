import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactForm from "@/components/ContactForm";
export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Get in touch</span>
            <h1>Good work usually starts with a question.</h1>
            <p>
              Tell us what you are thinking, what you need, or where you would like to help. We will
              point you in the right direction.
            </p>
          </div>
        </section>
        <section className="section">
          <div className="container grid-2">
            <ContactForm />
            <div>
              <span className="eyebrow">What to expect</span>
              <h2 className="display" style={{ fontSize: "clamp(2.2rem,5vw,4rem)" }}>
                A human reply, not a <em>black box.</em>
              </h2>
              <p className="lede">
                We read every message and respond as soon as we can. If your note is about an
                upcoming event or volunteering, include that context and we will make the next step
                easier.
              </p>
              <div className="card card-accent">
                <h3>Prefer email?</h3>
                <p>Write to hello@kalenbnakafl.org and tell us what you would like to explore.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
