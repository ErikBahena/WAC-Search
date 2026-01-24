export function Disclaimer() {
  return (
    <div className="text-center text-xs text-text-muted space-y-1 px-4">
      <p>
        <strong>Unofficial resource.</strong> Not affiliated with or endorsed by the State of Washington.
      </p>
      <p>
        Always verify at{" "}
        <a
          href="https://app.leg.wa.gov/wac/default.aspx?cite=110-300"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary-dark"
        >
          leg.wa.gov
        </a>
      </p>
    </div>
  )
}
