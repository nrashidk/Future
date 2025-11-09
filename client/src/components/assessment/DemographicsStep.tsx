import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Cake, GraduationCap, Users2 } from "lucide-react";

interface DemographicsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
}

export function DemographicsStep({ data, onUpdate, onNext }: DemographicsStepProps) {
  const canProceed = data.name && data.age && data.grade && data.gender;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">Let's Get to Know You! 👋</h2>
        <p className="text-lg text-muted-foreground font-body">
          Tell us a bit about yourself to get started
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <StickyNote color="yellow" rotation="-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <Label htmlFor="name" className="text-lg font-semibold">Your Name</Label>
          </div>
          <Input
            id="name"
            type="text"
            placeholder="Enter your full name"
            value={data.name}
            onChange={(e) => onUpdate("name", e.target.value)}
            className="bg-background/50 border-foreground/20"
            data-testid="input-name"
          />
        </StickyNote>

        <StickyNote color="pink" rotation="1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Cake className="w-5 h-5 text-primary" />
            </div>
            <Label htmlFor="age" className="text-lg font-semibold">Age</Label>
          </div>
          <Input
            id="age"
            type="number"
            min="13"
            max="25"
            placeholder="Your age"
            value={data.age || ""}
            onChange={(e) => onUpdate("age", parseInt(e.target.value) || null)}
            className="bg-background/50 border-foreground/20"
            data-testid="input-age"
          />
        </StickyNote>

        <StickyNote color="blue" rotation="2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <Label htmlFor="grade" className="text-lg font-semibold">Current Grade</Label>
          </div>
          <Select value={data.grade} onValueChange={(value) => onUpdate("grade", value)}>
            <SelectTrigger className="bg-background/50 border-foreground/20" data-testid="select-grade">
              <SelectValue placeholder="Select your grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grade9">Grade 9</SelectItem>
              <SelectItem value="grade10">Grade 10</SelectItem>
              <SelectItem value="grade11">Grade 11</SelectItem>
              <SelectItem value="grade12">Grade 12</SelectItem>
              <SelectItem value="graduated">Recently Graduated</SelectItem>
            </SelectContent>
          </Select>
        </StickyNote>

        <StickyNote color="green" rotation="-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users2 className="w-5 h-5 text-primary" />
            </div>
            <Label htmlFor="gender" className="text-lg font-semibold">Gender</Label>
          </div>
          <Select value={data.gender} onValueChange={(value) => onUpdate("gender", value)}>
            <SelectTrigger className="bg-background/50 border-foreground/20" data-testid="select-gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>        </StickyNote>
      </div>

      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-demographics"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
