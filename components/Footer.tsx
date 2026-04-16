export default function Footer() {
  return (
    <footer
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px 16px",
        marginTop: "auto",
        borderTop: "1px solid #222",
        backgroundColor: "#0a0a0a",
      }}
    >
      <a
        href="https://www.securitymetrics.com/site_certificate?id=2500510&tk=b568b8b0ca06df558e9c061cf1b9e540"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://www.securitymetrics.com/portal/app/ngsm/assets/img/GreyContent_Credit_Card_Safe_White_Rec.png"
          alt="SecurityMetrics card safe certification logo"
          style={{
            height: "40px",
            width: "auto",
            backgroundColor: "#ffffff",
            borderRadius: "4px",
            padding: "4px 8px",
          }}
        />
      </a>
    </footer>
  );
}
