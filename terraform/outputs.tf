output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "acr_login_server" {
  value = module.acr.acr_login_server
}

output "aks_cluster_name" {
  value = module.aks.cluster_name
}

output "postgres_fqdn" {
  value     = module.postgres.fqdn
  sensitive = true
}

output "app_gateway_public_ip" {
  value = module.app_gateway.public_ip
}

output "log_analytics_workspace_id" {
  value = module.monitoring.log_analytics_workspace_id
}

output "app_insights_connection_string" {
  value     = module.monitoring.app_insights_connection_string
  sensitive = true
}
