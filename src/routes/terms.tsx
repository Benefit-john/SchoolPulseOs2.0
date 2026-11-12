import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms and Conditions | SchoolPulseOS" },
      { name: "description", content: "Terms for accessing SchoolPulseOS through your school." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms and Conditions"
      summary="These terms describe the basic rules for using SchoolPulseOS through a participating school."
    >
      <section>
        <h2>1. Access through your school</h2>
        <p>
          SchoolPulseOS is provided for school operations. You may use an account only when your
          school has authorized your access and only for the role assigned to you. Your school may
          set additional rules for its users and records.
        </p>
      </section>
      <section>
        <h2>2. Account responsibilities</h2>
        <ul>
          <li>Provide accurate account information and keep your sign-in details confidential.</li>
          <li>Use only the school records and features you are authorized to access.</li>
          <li>
            Tell your school administrator promptly if you suspect account misuse or an incorrect
            account link.
          </li>
          <li>
            Do not share another person's records or use the service to harass, deceive, or
            unlawfully access systems or information.
          </li>
        </ul>
      </section>
      <section>
        <h2>3. School records</h2>
        <p>
          Schools and their authorized users are responsible for the accuracy and appropriate use of
          records they enter. You must have the necessary authority before adding, changing, or
          sharing information about a student, family, staff member, or visitor.
        </p>
      </section>
      <section>
        <h2>4. Payments and third-party services</h2>
        <p>
          Where payment features are enabled, payment processing is provided by a third-party
          payment service. Its checkout, terms, and privacy notice apply to information you provide
          directly to that provider. SchoolPulseOS may display transaction status and receipt
          information supplied for school records.
        </p>
      </section>
      <section>
        <h2>5. Availability and access changes</h2>
        <p>
          Features depend on your school's configuration and the availability of the service and its
          providers. A school may change or end your access when your role or school relationship
          changes. Contact your school administrator for help with access or school-specific
          decisions.
        </p>
      </section>
      <section>
        <h2>6. Misuse and safety</h2>
        <p>
          Do not attempt to bypass access controls, interfere with service operation, upload
          malicious material, or use the service in violation of law or your school's rules. The
          service is an operational record system and does not replace your school's emergency,
          safeguarding, or payment dispute procedures.
        </p>
      </section>
      <section>
        <h2>7. Changes and questions</h2>
        <p>
          These terms may be updated as the service changes. Continued access after an updated
          version is published is subject to the revised terms. For questions about your account or
          school access, contact the school administrator who invited you.
        </p>
      </section>
    </LegalPage>
  );
}
