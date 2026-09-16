import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState([]);
  const [testcases, setTestcases] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [file, setFile] = useState(null);
  const [documentId, setDocumentId] = useState("");
  const [loading, setLoading] = useState(false);

  const getProjects = async () => {
    const response = await fetch(`${API_URL}/projects`);
    const data = await response.json();
    setProjects(data);
  };

  const getTestcases = async () => {
    const response = await fetch(`${API_URL}/testcases`);
    const data = await response.json();
    setTestcases(data);
  };

  const createProject = async () => {
    await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        description: "Created from frontend",
      }),
    });

    setProjectName("");
    getProjects();
  };

  const uploadDocument = async () => {
    if (!selectedProjectId || !file) {
      alert("Please select project and upload PDF file");
      return;
    }

    const formData = new FormData();
    formData.append("project_id", selectedProjectId);
    formData.append("file", file);

    setLoading(true);

    const response = await fetch(`${API_URL}/upload-document`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    setDocumentId(data.document.id);
    setLoading(false);

    alert("Document uploaded successfully");
  };

  const generateTestcases = async () => {
    if (!documentId) {
      alert("Please upload document first");
      return;
    }

    setLoading(true);

    await fetch(`${API_URL}/generate-testcases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_id: Number(documentId),
      }),
    });

    setLoading(false);
    getTestcases();

    alert("AI test cases generated successfully");
  };

  useEffect(() => {
    getProjects();
    getTestcases();
  }, []);

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>AI-Powered Test Case Tracking Platform</h1>

      <hr />

      <h2>Dashboard</h2>
      <h3>Total Projects: {projects.length}</h3>
      <h3>Total Test Cases: {testcases.length}</h3>

      <hr />

      <h2>Create New Project</h2>

      <input
        type="text"
        placeholder="Enter Project Name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        style={{ padding: "10px", width: "300px", marginRight: "10px" }}
      />

      <button onClick={createProject} style={{ padding: "10px 20px" }}>
        Create Project
      </button>

      <hr />

      <h2>Upload SRS/SOW PDF</h2>

      <select
        value={selectedProjectId}
        onChange={(e) => setSelectedProjectId(e.target.value)}
        style={{ padding: "10px", width: "300px", marginRight: "10px" }}
      >
        <option value="">Select Project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={uploadDocument} style={{ padding: "10px 20px", marginLeft: "10px" }}>
        Upload Document
      </button>

      {documentId && <p>Uploaded Document ID: {documentId}</p>}

      <button
        onClick={generateTestcases}
        style={{ padding: "10px 20px", marginTop: "10px" }}
      >
        Generate AI Test Cases
      </button>

      {loading && <p>Processing... please wait</p>}

      <hr />

      <h2>Project List</h2>

      {projects.map((project) => (
        <div key={project.id}>
          <h3>{project.name}</h3>
          <p>{project.description}</p>
        </div>
      ))}

      <hr />

      <h2>Generated Test Cases</h2>

      {testcases.map((testcase) => (
        <div key={testcase.id} style={{ border: "1px solid gray", padding: "10px", margin: "10px 0" }}>
          <h3>{testcase.title}</h3>
          <p><b>Project ID:</b> {testcase.project_id}</p>
          <p><b>Steps:</b> {testcase.steps}</p>
          <p><b>Expected Result:</b> {testcase.expected_result}</p>
          <p><b>Status:</b> {testcase.status}</p>
        </div>
      ))}
    </div>
  );
}

export default App;