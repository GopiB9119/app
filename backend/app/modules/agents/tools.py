from dataclasses import dataclass


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    version: str
    description: str
    effect: str
    risk: str
    requires_approval: bool


TOOLS = {
    tool.name: tool for tool in (
        ToolDefinition("family.members.list", "1", "Read the names of current members in the selected family Space.", "read", "low", False),
        ToolDefinition("family.tasks.list", "1", "Read tasks you can already see in the selected family Space.", "read", "low", False),
        ToolDefinition("agent.memory.read", "1", "Read memories you approved for the Agent.", "read", "low", False),
        ToolDefinition("tasks.create", "1", "Create one family task exactly as you approve it.", "write", "medium", True),
        ToolDefinition("tasks.complete", "1", "Mark one task you may operate on as completed, exactly as approved.", "write", "medium", True),
        ToolDefinition("reminders.schedule", "1", "Schedule one in-app reminder for yourself at the exact reviewed time.", "write", "medium", True),
        ToolDefinition("agent.memory.save", "1", "Save one memory you explicitly approve.", "write", "medium", True),
    )
}

POLICY_VERSION = "agent-policy-local-2026-09-26"

REFUSALS = {
    "health": "I can't help with medicines, doses, symptoms or other health decisions. Please use the manual screens and ask a qualified clinician or pharmacist about treatment.",
    "external_contact": "I can't call, text, email or message anyone. I only work inside this family Space and never contact people for you.",
    "other_people": "I can't send reminders or messages to other members. Your own reminders are available through me; another member only gets a reminder after they accept a reminder request on the Reminders screen.",
    "financial": "I can't buy, pay, order or book anything. If you want to track it, say \"add a task to ...\".",
    "membership": "I can't invite, remove or change members or roles. The Space owner manages membership on the Spaces screen.",
    "deletion": "I can't delete tasks, reminders or other family data.",
    "sensitive_memory": "I won't save passwords, PINs, account numbers or other financial or identity details.",
}
