# Teldrassil: Modular Agentic Micro-Kernel Framework

Current agentic frameworks are often monolithic, coupling the orchestration logic with specific model providers and tool implementations. Teldrassil solves this "technical debt" by adopting a **Micro-Kernel Architecture** that decouples infrastructure (Plugins) from execution logic (Orchestrators) and task definitions (Project Manifests).

For a complete breakdown of the architecture, data boundaries, and protocols, please read the [Full Design Document](docs/design.md) and [Detailed Component Design](docs/detailed-components.md).

## Tech Stack

Teldrassil is built for hybrid deployment (Local CLI + Cloud Native). The core architecture leverages dynamic in-memory plugin loading to maximize performance.

- **Core & Orchestration:** TypeScript / Node.js
- **Managing UI:** React (Next.js) with Zustand/Jotai
- **Schema Validation:** Zod
- **Memory Security:** AES-256-GCM (Envelope Encryption) + HMAC Signed URIs

## System Architecture

The following diagram illustrates the flow of data, boundaries between Pointer (State) and Payload (Memory), and the "Immutable Core" of vital plugins.

```mermaid
graph TB
    subgraph User_Definition ["User Definition"]
        Manifest[Project Manifest YAML]
    end

    subgraph The_Immutable_Core ["The Immutable Core"]
        Kernel{{"Micro-Kernel\n(Lifecycle & Event Bus)"}}
        
        subgraph Vital_Plugins ["Vital Plugins (Required)"]
            SM[("State Manager\n[The Ledger]\nPointers, Status, ≤4KB")]
            ME[("Memory Engine\n[The Warehouse]\nPayloads, Vectors, URIs")]
            Vault["Identity Vault\n[The Passport]\nJIT Token Injection"]
            Drivers["Model Drivers\n[The Voice]\nProvider Schemas"]
        end
        
        Kernel <--> SM
        Kernel <--> ME
        Kernel <--> Vault
        Kernel <--> Drivers
    end

    subgraph Extension_Plugins ["Extension Plugins"]
        MCP["MCP Bridge\n(External Tools)"]
        Kernel <--> MCP
    end

    subgraph Orchestration_Strategies ["Orchestration & Strategies"]
        DAG["DAG Strategy\n(Supervisor/Evaluator)"]
        Swarm["Swarm Strategy\n(Planner)"]
        Wildcard{"Wildcard Rule\n(Anti-Tunneling Intercept)"}
        
        Kernel <--> DAG
        Kernel <--> Swarm
        DAG --> Wildcard
        Swarm --> Wildcard
    end

    subgraph Execution_Layer ["Execution Layer"]
        Agent["Worker Agent\n(Intelligence Instance)"]
        Human["Human-Attach Mode\n(OOB Login)"]
        Workspace[/"Shared Workspace\n(Git / Filesystem)"/]
        
        Agent <-->|"Proactive Context Queries"| ME
        Agent <-->|"Headless Work"| Workspace
        Human <-->|"Manual Override"| Workspace
    end

    %% Data Flow & Dependencies (Corrected Paths)
    
    %% Provider-Instance Pattern
    Manifest -. "Capabilities" .-> Drivers
    Manifest -. "use_driver" .-> Agent
    Drivers -. "Translates Instance logic" .-> Agent

    %% Pointer vs Payload Boundary
    Agent -->|"1. Raw Data"| ME
    ME -. "2. Returns unique_uri" .-> Agent
    Agent -->|"3. Logs Step + URI"| SM

    %% The Wildcard Rule Intercept
    Wildcard -. "Triggers Rework if\nDiversity < Threshold" .-> Agent

    %% Security & Tool Execution Flow
    Agent -->|"Tool Request"| MCP
    Vault -. "Injects Token (JIT)" .-> MCP
    Human -. "OOB Auth Escalation" .-> Vault
```
