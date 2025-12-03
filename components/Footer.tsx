// components/Footer.tsx
export function Footer() {
  return (
    <footer className="site-footer-bp">
      <div className="container-bp">
        <p>&copy; {new Date().getFullYear()} Before Publishing. All rights reserved.</p>
        <div className="footer-links-bp">
          <a href="/privacy">Privacy Policy</a> • 
          <a href="/terms">Terms of Use</a> • 
          <a href="mailto:support@beforepublishing.com">Contact</a>
        </div>
      </div>
    </footer>
  );
}