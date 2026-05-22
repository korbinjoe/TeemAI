const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{
    padding: 16, borderRadius: 8,
    border: '1px solid rgb(var(--border-color))',
    background: 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))',
  }}>
    <div style={{
      fontSize: 12, fontWeight: 600, color: 'rgb(var(--text-emphasis))', marginBottom: 12,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {title}
    </div>
    {children}
  </div>
)

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, color: 'rgb(var(--text-secondary))', marginBottom: 4 }}>{children}</div>
)

export { Section, FieldLabel }
