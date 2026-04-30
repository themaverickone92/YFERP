import { PieChart, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Sidebar from "@/components/dashboard/sidebar";

export default function Analytics() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="md:ml-64">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold text-gray-800">Analytics</h1>
                <p className="text-gray-600 mt-1">Business insights and reporting</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-6">
          <Card className="text-center py-16">
            <CardHeader>
              <div className="flex justify-center mb-4">
                <Construction className="w-16 h-16 text-orange-500" />
              </div>
              <CardTitle className="text-2xl text-gray-800">Under Development</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-lg">
                This feature is currently being developed. Check back soon for updates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}