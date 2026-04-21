import express from "express";
import { serialService } from "../services/serial.service.js";

const router = express.Router();

router.post("/start", async (req, res) => {
  const status = serialService.getStatus();
  if (status.running) {
    return res.json({ status: "ALREADY_RUNNING", message: "System is already active" });
  }

  console.log("System start requested...");
  await serialService.connect();
  
  res.json({ status: "SUCCESS", message: "System initialized" });
});

router.post("/stop", (req, res) => {
  console.log("System stop requested...");
  serialService.disconnect();
  res.json({ status: "SUCCESS", message: "System stopped" });
});

router.get("/status", (req, res) => {
  const serialStatus = serialService.getStatus();
  res.json({
    status: serialStatus.running ? "RUNNING" : "STOPPED",
    machineConnected: serialStatus.connected,
    port: serialStatus.port
  });
});

export default router;
