/**
 * Types TypeScript partages dans toute l'application MPW.
 * Mirroring les schemas Pydantic du backend.
 */

export interface ContainerPort {
  host_ip: string | null;
  host_port: number | null;
  container_port: number;
  protocol: string;
}

export interface Container {
  id: string;
  short_id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: ContainerPort[];
  created: number;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  net_input: number;
  net_output: number;
}

export interface LogEntry {
  stream: "stdout" | "stderr";
  text: string;
}

export type ContainerAction = "start" | "stop" | "restart";

/** Onglets disponibles dans le panneau de detail d'un conteneur. */
export type DetailTab = "logs" | "stats";
