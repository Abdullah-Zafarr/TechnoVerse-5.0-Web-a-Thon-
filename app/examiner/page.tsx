import ExaminerWorkspaceClient from "@/components/ExaminerWorkspaceClient";
import { getSessionUser } from "@/lib/auth";
import { loadExaminerWorkspaceData } from "@/lib/examinerWorkspace";

export const dynamic = "force-dynamic";

export default async function ExaminerPage() {
  const user = await getSessionUser();

  if (!user || (user.role !== "examiner" && user.role !== "admin")) {
    return (
      <ExaminerWorkspaceClient
        initialLoaded
        initialUser={user}
        initialExams={[]}
        initialQuestions={[]}
        initialCandidates={[]}
      />
    );
  }

  const data = await loadExaminerWorkspaceData(user);

  return (
    <ExaminerWorkspaceClient
      initialLoaded
      initialUser={user}
      initialExams={data.exams}
      initialQuestions={data.questions}
      initialCandidates={data.candidates}
    />
  );
}
