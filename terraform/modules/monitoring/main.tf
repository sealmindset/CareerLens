variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "aks_cluster_id" { type = string }

variable "log_retention_days" {
  description = "Number of days to retain logs in Log Analytics"
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = ""
}

locals {
  tags = {
    Environment = var.environment
    Project     = "CareerLens"
    ManagedBy   = "Terraform"
  }
}

# ---------------------------------------------------------------------------
# Log Analytics Workspace
# ---------------------------------------------------------------------------

resource "azurerm_log_analytics_workspace" "main" {
  name                = "careerlens-${var.environment}-law"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Application Insights
# ---------------------------------------------------------------------------

resource "azurerm_application_insights" "main" {
  name                = "careerlens-${var.environment}-appinsights"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Container Insights for AKS
# ---------------------------------------------------------------------------

resource "azurerm_log_analytics_solution" "container_insights" {
  solution_name         = "ContainerInsights"
  location              = var.location
  resource_group_name   = var.resource_group_name
  workspace_resource_id = azurerm_log_analytics_workspace.main.id
  workspace_name        = azurerm_log_analytics_workspace.main.name

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/ContainerInsights"
  }

  tags = local.tags
}

resource "azurerm_monitor_diagnostic_setting" "aks" {
  name                       = "careerlens-${var.environment}-aks-diag"
  target_resource_id         = var.aks_cluster_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "kube-audit"
  }

  enabled_log {
    category = "guard"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# ---------------------------------------------------------------------------
# Action Group (for alert notifications)
# ---------------------------------------------------------------------------

resource "azurerm_monitor_action_group" "main" {
  count               = var.alert_email != "" ? 1 : 0
  name                = "careerlens-${var.environment}-alerts"
  resource_group_name = var.resource_group_name
  short_name          = "cl-alerts"

  email_receiver {
    name          = "ops-email"
    email_address = var.alert_email
  }

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Alert Rules
# ---------------------------------------------------------------------------

# High CPU on AKS nodes
resource "azurerm_monitor_metric_alert" "aks_cpu" {
  name                = "careerlens-${var.environment}-aks-high-cpu"
  resource_group_name = var.resource_group_name
  scopes              = [var.aks_cluster_id]
  description         = "AKS node CPU utilization exceeds 85%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Insights.Container/nodes"
    metric_name      = "cpuUsagePercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  dynamic "action" {
    for_each = azurerm_monitor_action_group.main
    content {
      action_group_id = action.value.id
    }
  }

  tags = local.tags
}

# High Memory on AKS nodes
resource "azurerm_monitor_metric_alert" "aks_memory" {
  name                = "careerlens-${var.environment}-aks-high-memory"
  resource_group_name = var.resource_group_name
  scopes              = [var.aks_cluster_id]
  description         = "AKS node memory utilization exceeds 85%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Insights.Container/nodes"
    metric_name      = "memoryWorkingSetPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  dynamic "action" {
    for_each = azurerm_monitor_action_group.main
    content {
      action_group_id = action.value.id
    }
  }

  tags = local.tags
}

# Pod restart alert
resource "azurerm_monitor_metric_alert" "pod_restarts" {
  name                = "careerlens-${var.environment}-pod-restarts"
  resource_group_name = var.resource_group_name
  scopes              = [var.aks_cluster_id]
  description         = "Pod restart count exceeds threshold — possible crash loop"
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Insights.Container/pods"
    metric_name      = "restartingContainerCount"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 3
  }

  dynamic "action" {
    for_each = azurerm_monitor_action_group.main
    content {
      action_group_id = action.value.id
    }
  }

  tags = local.tags
}

# Application Insights — server response time
resource "azurerm_monitor_metric_alert" "response_time" {
  name                = "careerlens-${var.environment}-slow-response"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Server response time exceeds 5s average"
  severity            = 3
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/duration"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 5000
  }

  dynamic "action" {
    for_each = azurerm_monitor_action_group.main
    content {
      action_group_id = action.value.id
    }
  }

  tags = local.tags
}

# Application Insights — failed requests
resource "azurerm_monitor_metric_alert" "failed_requests" {
  name                = "careerlens-${var.environment}-failed-requests"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Failed request rate exceeds 10 per 5 minutes"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT5M"
  enabled             = true

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/failed"
    aggregation      = "Count"
    operator         = "GreaterThan"
    threshold        = 10
  }

  dynamic "action" {
    for_each = azurerm_monitor_action_group.main
    content {
      action_group_id = action.value.id
    }
  }

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.main.id
}

output "app_insights_instrumentation_key" {
  value     = azurerm_application_insights.main.instrumentation_key
  sensitive = true
}

output "app_insights_connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}
