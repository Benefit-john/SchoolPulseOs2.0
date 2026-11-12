import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | SchoolPulseOS" },
      {
        name: "description",
        content: "How SchoolPulseOS handles account information and school records.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="This policy describes information handled through SchoolPulseOS when a school provides access to the service."
    >
      <section>
        <h2>1. Roles and scope</h2>
        <p>
          The school that gives you access decides what school and student records to enter and how
          those records are used. SchoolPulseOS provides the software through which
          school-authorized users manage and view those records. Your school can explain its own
          privacy practices and provide the right contact for a request about a school record.
        </p>
      </section>
      <section>
        <h2>2. Information handled</h2>
        <p>Depending on the features your school uses, the service may handle:</p>
        <ul>
          <li>
            Account details such as name, email address, phone number, role, and sign-in
            identifiers.
          </li>
          <li>
            School records such as student identifiers, guardian relationships, attendance, results,
            assignments, timetables, fee records, and messages.
          </li>
          <li>
            Operational and safety records such as visitor entries, staff activity, camera
            configuration, and camera access audit events.
          </li>
          <li>
            Payment records such as amount, status, transaction reference, and receipt information.
            Payment checkout is provided by a payment service and is subject to that provider's
            terms and privacy notice.
          </li>
          <li>
            Technical and security information needed to authenticate users, protect accounts, and
            operate the service.
          </li>
        </ul>
      </section>
      <section>
        <h2>3. How information is used</h2>
        <p>
          Information is used to provide school features, link authorized users to the correct
          school records, process and reconcile payment requests, maintain service security, and
          respond to support or operational issues. Schools are responsible for confirming that they
          have an appropriate basis to provide information about students and families through the
          service.
        </p>
      </section>
      <section>
        <h2>4. Access and service providers</h2>
        <p>
          School administrators and other users may access records according to the roles and
          permissions configured for their school. The service also relies on providers for hosting,
          authentication, data storage, email delivery, and payment processing. Information is
          shared with those providers only as needed to provide the relevant service.
        </p>
      </section>
      <section>
        <h2>5. Retention and requests</h2>
        <p>
          School records are managed by the school. Retention periods may depend on the school's
          requirements and applicable law. To request access to, correction of, or deletion of a
          school record, contact the school administrator who provided your access. Some
          operational, security, or payment records may need to be retained for legitimate service
          or legal requirements.
        </p>
      </section>
      <section>
        <h2>6. Children and guardians</h2>
        <p>
          SchoolPulseOS may contain information about students, including children. Student access
          and guardian links should be created or approved through the student's school. Contact the
          school if a student account or guardian link is incorrect.
        </p>
      </section>
      <section>
        <h2>7. Security and updates</h2>
        <p>
          Access controls and technical safeguards are used to protect information. No online
          service can guarantee absolute security. This policy may be updated when service features
          or requirements change. The latest version will be published on this page.
        </p>
      </section>
    </LegalPage>
  );
}
